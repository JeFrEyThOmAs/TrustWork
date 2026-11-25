import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Award,
  Download,
  QrCode,
  ShieldCheck,
  ShieldOff,
  SearchCheck,
  Eye,
  Lock,
  Edit3,
  Cpu,
  Database,
} from 'lucide-react';
import { apiFetch, formatCurrency, initials, shortHex, tierMeta } from '../lib/wallet.js';

export default function ReputationPassportTab({
  identities,
  credentials,
  zkpProofs,
  recentTransactions,
  smartDataSeparation,
  trustGraph,
  currentUser,
  inspectedDid,
  setInspectedDid,
  onOpenAudit,
  onRefresh,
  showToast,
}) {
  const activeDid = inspectedDid || currentUser?.did || identities[0]?.did;
  const profile = useMemo(
    () => identities.find((i) => i.did === activeDid) || currentUser || identities[0],
    [identities, activeDid, currentUser]
  );

  const [vcModal, setVcModal] = useState(null);
  const [qrModal, setQrModal] = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [zkpClaimType, setZkpClaimType] = useState('MIN_EARNINGS_INR');
  const [zkpThreshold, setZkpThreshold] = useState(1000000);
  const [zkpVerifiedMap, setZkpVerifiedMap] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!inspectedDid && currentUser?.did) {
      setInspectedDid(currentUser.did);
    }
  }, [currentUser?.did]);

  const earnedCredentials = useMemo(
    () => credentials.filter((c) => c.subjectDid === profile?.did),
    [credentials, profile]
  );

  const issuedByProfile = useMemo(
    () => credentials.filter((c) => c.issuerDid === profile?.did),
    [credentials, profile]
  );

  const profileZkps = useMemo(
    () => zkpProofs.filter((z) => z.subjectDid === profile?.did),
    [zkpProofs, profile]
  );

  function exportVcFile(cred) {
    const blob = new Blob([JSON.stringify(cred.vcDocument, null, 2)], {
      type: 'application/ld+json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trustwork-credential-${cred.id.slice(2, 10)}.vc.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function openQrPass(cred) {
    const payload = JSON.stringify({
      protocol: 'TrustWork-v2',
      credentialId: cred.id,
      vcHash: cred.vcHash,
      subjectDid: cred.subjectDid,
      issuerDid: cred.issuerDid,
      blockNumber: cred.blockNumber,
    });
    const dataUrl = await QRCode.toDataURL(payload, { width: 240, margin: 2 });
    setQrModal({ cred, dataUrl });
  }

  async function handleRevoke(cred) {
    if (currentUser?.did !== cred.issuerDid) {
      showToast(
        `Switch account to ${cred.issuerName} (the original Issuer) to revoke this credential on-chain.`,
        'error'
      );
      return;
    }
    const reason = window.prompt(
      'Reason for on-chain revocation (recorded permanently in the Revocation Registry):',
      'Disputed deliverable breach'
    );
    if (!reason) return;
    setBusy(true);
    try {
      await apiFetch(`/api/credentials/${cred.id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ actorDid: currentUser.did, reason }),
      });
      await onRefresh();
      showToast('Credential revoked on blockchain.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleTierUpdate(newTier) {
    try {
      await apiFetch(`/api/identities/${encodeURIComponent(profile.did)}/tier`, {
        method: 'POST',
        body: JSON.stringify({ issuerTier: newTier }),
      });
      await onRefresh();
      showToast(`Updated organization verification tier to ${newTier}`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleGenerateZkp(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/zkp/generate', {
        method: 'POST',
        body: JSON.stringify({
          subjectDid: profile.did,
          claimType: zkpClaimType,
          threshold: Number(zkpThreshold),
        }),
      });
      await onRefresh();
      showToast('Zero-Knowledge Privacy Proof generated!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function verifyZkp(z) {
    const res = await apiFetch('/api/zkp/verify', {
      method: 'POST',
      body: JSON.stringify({ proof: z.proof }),
    });
    setZkpVerifiedMap({ ...zkpVerifiedMap, [z.id]: res.valid });
  }

  if (!profile) return null;
  const isMyOwnProfile = profile.did === currentUser?.did;

  return (
    <div className="space-y-6">
      {/* Switcher Bar */}
      <div className="tw-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-700">
          Portable Self-Controlled Reputation Passport
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Viewing Profile:</span>
          <select
            value={profile.did}
            onChange={(e) => setInspectedDid(e.target.value)}
            className="tw-input w-auto text-xs font-semibold"
          >
            {identities.map((u) => (
              <option key={u.did} value={u.did}>
                {u.name} {u.did === currentUser?.did ? '(You)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Profile Header + Evidence Score */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 tw-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                style={{ backgroundColor: profile.avatarColor }}
                className="w-16 h-16 rounded-2xl text-white font-extrabold text-xl flex items-center justify-center shrink-0"
              >
                {initials(profile.name)}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-slate-900">{profile.name}</h1>
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                      tierMeta(profile.issuerTier).badge
                    }`}
                  >
                    ✓ {tierMeta(profile.issuerTier).label}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-600 mt-0.5">{profile.headline}</p>
                <div className="text-xs font-mono text-indigo-600 mt-1 break-all">
                  {profile.did}
                </div>
              </div>
            </div>

            {isMyOwnProfile && (
              <button
                type="button"
                onClick={() => setEditModal(true)}
                className="tw-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5 shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </button>
            )}
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">{profile.bio}</p>

          <div className="flex flex-wrap gap-1.5">
            {profile.skills.map((s) => (
              <span
                key={s}
                className="text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700"
              >
                {s}
              </span>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <div>
              Hourly Rate:{' '}
              <strong className="text-slate-900">{formatCurrency(profile.hourlyRate, 'INR')}/hr</strong>{' '}
              · {profile.location}
            </div>
            <div className="flex items-center gap-2">
              <span>Issuer Verification Tier:</span>
              <select
                value={profile.issuerTier}
                onChange={(e) => handleTierUpdate(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 bg-white"
              >
                <option value="INDIVIDUAL">Individual</option>
                <option value="VERIFIED_ORG">Verified Company</option>
                <option value="ENTERPRISE">Enterprise</option>
              </select>
            </div>
          </div>
        </div>

        {/* Evidence Score & Anti-Fraud Card */}
        <div className="lg:col-span-4 rounded-2xl bg-slate-900 text-white p-6 flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
              Portable Evidence Score
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-5xl font-extrabold text-emerald-400">
                {profile.reputation?.evidenceScore ?? 0}
              </span>
              <span className="text-sm text-slate-400">/ 100</span>
            </div>
            <div className="text-xs text-slate-300 mt-1">{profile.reputation?.trustGrade}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4 mt-4 border-t border-slate-800 text-xs">
            <div>
              <span className="text-slate-400 block">Verified Credentials</span>
              <span className="font-bold text-base">
                {profile.reputation?.breakdown?.activeCredentials}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Signed Milestones</span>
              <span className="font-bold text-base">
                {profile.reputation?.breakdown?.verifiedMilestones}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Anti-Collusion Check</span>
              <span className="font-bold text-emerald-400">
                {profile.reputation?.fraudAnalysis?.riskLevel}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Sybil Resistance</span>
              <span className="font-bold text-emerald-400">
                {profile.reputation?.fraudAnalysis?.sybilResistanceScore}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Earned W3C Verifiable Credentials */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">
          Earned W3C Verifiable Credentials ({earnedCredentials.length})
        </h2>

        {earnedCredentials.length === 0 ? (
          <div className="tw-card p-6 text-xs text-slate-500">
            No completed contract credentials earned by {profile.name} yet.
          </div>
        ) : (
          earnedCredentials.map((cred) => (
            <div key={cred.id} className="tw-card p-5 space-y-3">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {cred.revoked ? (
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">
                        Revoked ({cred.revocationReason})
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ✓ Blockchain Verified · Block #{cred.blockNumber}
                      </span>
                    )}
                    <span className="text-xs text-slate-500">
                      Issued by <strong>{cred.issuerName}</strong> ({tierMeta(cred.issuerTier).label})
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 mt-1.5">{cred.projectTitle}</h3>
                  <p className="text-sm text-slate-700 mt-0.5">
                    &ldquo;{cred.summaryStatement}&rdquo;
                  </p>
                  <div className="text-xs text-slate-500 mt-1">
                    Role: <strong>{cred.rolePerformed}</strong> · Deliverable Hashes:{' '}
                    <strong>{cred.deliverableHashes.length}</strong> · {'★'.repeat(cred.rating)}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setVcModal(cred)}
                    className="tw-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>JSON-LD</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportVcFile(cred)}
                    className="tw-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export .vc.json</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openQrPass(cred)}
                    className="tw-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1"
                  >
                    <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                    <span>QR Wallet Pass</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAudit('credential', cred.id, cred.vcDocument)}
                    className="tw-btn-primary px-3 py-1.5 text-xs flex items-center gap-1"
                  >
                    <SearchCheck className="w-3.5 h-3.5" />
                    <span>Verify Proof</span>
                  </button>
                  {!cred.revoked && currentUser?.did === cred.issuerDid && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRevoke(cred)}
                      className="tw-btn-secondary px-3 py-1.5 text-xs text-rose-600 border-rose-200"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Credentials Issued as a Gig Provider */}
      {issuedByProfile.length > 0 && (
        <div className="tw-card p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">
            Credentials Issued by {profile.name} as a Gig Provider ({issuedByProfile.length})
          </h3>
          {issuedByProfile.map((cred) => (
            <div
              key={cred.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs"
            >
              <div>
                <strong>{cred.projectTitle}</strong> → Issued to{' '}
                <strong>{cred.subjectName}</strong> ({cred.revoked ? 'Revoked' : 'Active'})
              </div>
              {!cred.revoked && isMyOwnProfile && (
                <button
                  type="button"
                  onClick={() => handleRevoke(cred)}
                  className="text-rose-600 font-semibold hover:underline cursor-pointer"
                >
                  Revoke On-Chain
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Privacy-Preserving Zero-Knowledge Revenue / Experience Claims */}
      <div className="tw-card p-5 space-y-4">
        <div>
          <h3 className="font-bold text-base text-slate-900">
            Privacy-Preserving Proof Badges (Zero-Knowledge Selective Disclosure)
          </h3>
          <p className="text-xs text-slate-500">
            Prove earnings or contract thresholds mathematically without exposing confidential client names or exact contract figures.
          </p>
        </div>

        {isMyOwnProfile && (
          <form onSubmit={handleGenerateZkp} className="flex flex-wrap items-end gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Claim Type</label>
              <select
                value={zkpClaimType}
                onChange={(e) => {
                  setZkpClaimType(e.target.value);
                  setZkpThreshold(e.target.value === 'MIN_EARNINGS_INR' ? 500000 : 1);
                }}
                className="tw-input w-auto text-xs"
              >
                <option value="MIN_EARNINGS_INR">Verified Contract Revenue Threshold (INR)</option>
                <option value="MIN_PROJECT_COUNT">Minimum Completed Verified Contracts</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Threshold</label>
              <input
                type="number"
                value={zkpThreshold}
                onChange={(e) => setZkpThreshold(e.target.value)}
                className="tw-input w-36 text-xs font-mono"
              />
            </div>
            <button type="submit" disabled={busy} className="tw-btn-primary px-4 py-2 text-xs">
              Generate Privacy Proof
            </button>
          </form>
        )}

        <div className="space-y-2">
          {profileZkps.map((z) => (
            <div
              key={z.id}
              className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            >
              <div>
                <div className="font-bold text-slate-900">{z.title}</div>
                <div className="font-mono text-[11px] text-slate-500">
                  Commitment: {shortHex(z.publicCommitment, 16, 10)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {zkpVerifiedMap[z.id] !== undefined && (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                    {zkpVerifiedMap[z.id] ? '✓ Cryptographically Valid' : '✗ Invalid'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => verifyZkp(z)}
                  className="tw-btn-secondary px-3 py-1.5 text-xs"
                >
                  Verify Proof
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Platform Architecture Transparency: Off-Chain vs On-Chain Ledger */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="tw-card p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-indigo-600" />
              Smart Data Separation &amp; Anti-Collusion Graph
            </span>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              {smartDataSeparation?.compressionRatio}
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Private bios, messages, and full contract documents stay off-chain in SQLite &amp; IPFS ({smartDataSeparation?.offChainPayloadBytes?.toLocaleString()} B), while compact 32-byte Keccak-256 hashes &amp; dual signatures are anchored on-chain ({smartDataSeparation?.onChainFingerprintBytes} B). Network Graph Status: <strong>{trustGraph?.networkHealth}</strong>.
          </p>
        </div>

        <div className="tw-card p-5 space-y-2">
          <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-emerald-600" />
            Recent Blockchain Ledger Anchors
          </div>
          <div className="space-y-1.5 max-h-28 overflow-y-auto text-xs font-mono">
            {recentTransactions?.slice(0, 4).map((tx) => (
              <div key={tx.tx_hash} className="text-[11px] text-slate-600 truncate">
                <span className="font-semibold text-indigo-700">Block #{tx.block_number}</span> ·{' '}
                {tx.summary}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* W3C VC JSON-LD Viewer Modal */}
      {vcModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="tw-card max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-sm">W3C Verifiable Credential (JSON-LD)</span>
              <button
                type="button"
                onClick={() => setVcModal(null)}
                className="tw-btn-secondary px-3 py-1 text-xs"
              >
                Close
              </button>
            </div>
            <div className="p-4 overflow-y-auto bg-slate-950 text-emerald-300 text-xs font-mono">
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(vcModal.vcDocument, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Mobile QR Pass Modal */}
      {qrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="tw-card max-w-sm w-full p-6 text-center space-y-3">
            <span className="text-xs font-bold text-indigo-600 uppercase">
              Portable Credential QR Pass
            </span>
            <h3 className="font-bold text-base text-slate-900">{qrModal.cred.projectTitle}</h3>
            <p className="text-xs text-slate-500">
              Scan at interviews or share across platforms for instant 1-second verification.
            </p>
            <img
              src={qrModal.dataUrl}
              alt="Credential QR"
              className="w-52 h-52 mx-auto rounded-xl border border-slate-200 p-2"
            />
            <button
              type="button"
              onClick={() => setQrModal(null)}
              className="tw-btn-primary w-full py-2 text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {editModal && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditModal(false)}
          onSaved={async () => {
            setEditModal(false);
            await onRefresh();
            showToast('Profile updated!');
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function EditProfileModal({ profile, onClose, onSaved, showToast }) {
  const [name, setName] = useState(profile.name);
  const [headline, setHeadline] = useState(profile.headline);
  const [hourlyRate, setHourlyRate] = useState(profile.hourlyRate);
  const [location, setLocation] = useState(profile.location);
  const [bio, setBio] = useState(profile.bio);
  const [skillsText, setSkillsText] = useState(profile.skills.join(', '));
  const [busy, setBusy] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/identities/${encodeURIComponent(profile.did)}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          headline,
          hourlyRate: Number(hourlyRate),
          location,
          bio,
          skills: skillsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      await onSaved();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="tw-card max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="font-bold text-base">Edit Your TrustWork Profile</h3>
          <button type="button" onClick={onClose} className="tw-btn-secondary px-3 py-1 text-xs">
            Cancel
          </button>
        </div>
        <form onSubmit={handleSave} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="tw-input text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Hourly Rate (INR)</label>
              <input
                type="number"
                required
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className="tw-input text-xs font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Headline</label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="tw-input text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Bio</label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="tw-input text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Skills (comma-separated)</label>
            <input
              type="text"
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              className="tw-input text-xs"
            />
          </div>
          <button type="submit" disabled={busy} className="tw-btn-primary w-full py-2.5 text-xs">
            {busy ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
