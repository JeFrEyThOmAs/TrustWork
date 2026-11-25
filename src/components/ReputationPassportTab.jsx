import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { apiFetch, formatCurrency, initials, shortHex, tierMeta } from '../lib/wallet.js';

export default function ReputationPassportTab({
  identities,
  credentials,
  zkpProofs,
  recentTransactions,
  trustGraph,
  currentUser,
  inspectedDid,
  setInspectedDid,
  onOpenAudit,
  onRefresh,
  showToast,
}) {
  const activeDid = inspectedDid || currentUser?.did;
  const profile = useMemo(
    () => identities.find((i) => i.did === activeDid) || currentUser,
    [identities, activeDid, currentUser]
  );

  const [vcModal, setVcModal] = useState(null);
  const [qrModal, setQrModal] = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [zkpClaimType, setZkpClaimType] = useState('MIN_EARNINGS_INR');
  const [zkpThreshold, setZkpThreshold] = useState(100000);
  const [zkpVerifiedMap, setZkpVerifiedMap] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!inspectedDid && currentUser?.did) setInspectedDid(currentUser.did);
  }, [currentUser?.did]);

  const earnedCredentials = useMemo(
    () => credentials.filter((c) => c.subjectDid === profile?.did),
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
    a.download = `credential-${cred.id.slice(2, 10)}.vc.json`;
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
    const dataUrl = await QRCode.toDataURL(payload, { width: 220, margin: 2 });
    setQrModal({ cred, dataUrl });
  }

  async function handleRevoke(cred) {
    const reason = window.prompt('Reason for on-chain revocation:', 'Revoked by issuer');
    if (!reason) return;
    setBusy(true);
    try {
      await apiFetch(`/api/credentials/${cred.id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      await onRefresh();
      showToast('Credential revoked on-chain.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleTierUpdate(newTier) {
    try {
      await apiFetch('/api/profile/tier', {
        method: 'POST',
        body: JSON.stringify({ issuerTier: newTier }),
      });
      await onRefresh();
      showToast(`Account tier updated to ${newTier}.`);
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
          claimType: zkpClaimType,
          threshold: Number(zkpThreshold),
        }),
      });
      await onRefresh();
      showToast('Selective disclosure proof generated.');
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
  const isOwn = profile.did === currentUser?.did;

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="h-14 shrink-0 border-b border-zinc-200 px-6 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-zinc-900">Portable Credentials &amp; DID</h1>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Profile:</span>
          <select
            value={profile.did}
            onChange={(e) => setInspectedDid(e.target.value)}
            className="ui-input w-auto py-1 text-xs"
          >
            {identities.map((u) => (
              <option key={u.did} value={u.did}>
                {u.name} {u.did === currentUser?.did ? '(You)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8">
        {/* Profile + Score */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 border border-zinc-200 rounded-lg p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div
                  style={{ backgroundColor: profile.avatarColor || '#18181B' }}
                  className="w-12 h-12 rounded-md text-white font-semibold text-base flex items-center justify-center shrink-0"
                >
                  {initials(profile.name)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-zinc-900">{profile.name}</h2>
                    <span className={`ui-badge ${tierMeta(profile.issuerTier).badge}`}>
                      {tierMeta(profile.issuerTier).label}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 mt-0.5">{profile.headline}</p>
                  <div className="text-xs font-mono text-zinc-500 mt-1 break-all">{profile.did}</div>
                </div>
              </div>

              {isOwn && (
                <button
                  type="button"
                  onClick={() => setEditModal(true)}
                  className="ui-btn-secondary"
                >
                  Edit Profile
                </button>
              )}
            </div>

            {profile.bio && <p className="text-xs text-zinc-600 leading-relaxed">{profile.bio}</p>}

            <div className="flex flex-wrap gap-1.5">
              {profile.skills.map((s) => (
                <span key={s} className="px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded text-xs">
                  {s}
                </span>
              ))}
            </div>

            <div className="pt-3 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
              <span className="tabular-nums">
                Rate: <strong className="text-zinc-900">{formatCurrency(profile.hourlyRate, 'INR')}/hr</strong> · {profile.location}
              </span>

              {isOwn && (
                <div className="flex items-center gap-2">
                  <span>Issuer tier:</span>
                  <select
                    value={profile.issuerTier}
                    onChange={(e) => handleTierUpdate(e.target.value)}
                    className="border border-zinc-300 rounded px-2 py-1 text-xs text-zinc-800 bg-white"
                  >
                    <option value="INDIVIDUAL">Individual</option>
                    <option value="VERIFIED_ORG">Verified Company</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 border border-zinc-200 rounded-lg p-6 bg-zinc-50/50 flex flex-col justify-between">
            <div>
              <div className="text-xs font-medium text-zinc-500">Evidence Score</div>
              <div className="text-4xl font-semibold tabular-nums text-zinc-900 mt-1">
                {profile.reputation?.evidenceScore ?? 0}
                <span className="text-sm font-normal text-zinc-400"> / 100</span>
              </div>
              <div className="text-xs text-zinc-500 mt-1">{profile.reputation?.trustGrade}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 mt-4 border-t border-zinc-200 text-xs tabular-nums">
              <div>
                <div className="text-zinc-500">Credentials</div>
                <div className="font-semibold text-zinc-900">
                  {profile.reputation?.breakdown?.activeCredentials}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">Milestones</div>
                <div className="font-semibold text-zinc-900">
                  {profile.reputation?.breakdown?.verifiedMilestones}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">Collusion Risk</div>
                <div className="font-semibold text-emerald-700">
                  {profile.reputation?.fraudAnalysis?.riskLevel}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">Sybil Integrity</div>
                <div className="font-semibold text-zinc-900">
                  {profile.reputation?.fraudAnalysis?.sybilResistanceScore}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* W3C Credentials */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900">
            W3C Verifiable Credentials ({earnedCredentials.length})
          </h3>
          {earnedCredentials.length === 0 ? (
            <div className="p-6 border border-dashed border-zinc-300 rounded-lg text-xs text-zinc-500">
              No credentials issued to this DID yet. Complete an agreement to earn portable verifiable credentials.
            </div>
          ) : (
            <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-200">
              {earnedCredentials.map((cred) => (
                <div
                  key={cred.id}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-zinc-900">
                        {cred.projectTitle}
                      </span>
                      <span
                        className={`ui-badge ${
                          cred.revoked
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {cred.revoked ? 'Revoked' : `Block #${cred.blockNumber}`}
                      </span>
                    </div>
                    <div className="text-zinc-700">{cred.summaryStatement}</div>
                    <div className="text-zinc-500">
                      Issued by <strong>{cred.issuerName}</strong> ({tierMeta(cred.issuerTier).label}) · {cred.rolePerformed}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setVcModal(cred)}
                      className="ui-btn-secondary py-1 px-2.5 text-xs"
                    >
                      JSON-LD
                    </button>
                    <button
                      type="button"
                      onClick={() => exportVcFile(cred)}
                      className="ui-btn-secondary py-1 px-2.5 text-xs"
                    >
                      Export .vc.json
                    </button>
                    <button
                      type="button"
                      onClick={() => openQrPass(cred)}
                      className="ui-btn-secondary py-1 px-2.5 text-xs"
                    >
                      QR Code
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenAudit('credential', cred.id, cred.vcDocument)}
                      className="ui-btn-primary py-1 px-2.5 text-xs"
                    >
                      Verify
                    </button>
                    {!cred.revoked && currentUser?.did === cred.issuerDid && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRevoke(cred)}
                        className="ui-btn-secondary py-1 px-2.5 text-xs text-red-600"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Zero-Knowledge Selective Disclosure */}
        <div className="border border-zinc-200 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              Selective Disclosure Proofs (Zero-Knowledge Thresholds)
            </h3>
            <p className="text-xs text-zinc-500">
              Prove minimum verified earnings or completed contract counts without disclosing client identities or contract amounts.
            </p>
          </div>

          {isOwn && (
            <form onSubmit={handleGenerateZkp} className="flex flex-wrap items-end gap-3 text-xs">
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Claim</label>
                <select
                  value={zkpClaimType}
                  onChange={(e) => {
                    setZkpClaimType(e.target.value);
                    setZkpThreshold(e.target.value === 'MIN_EARNINGS_INR' ? 100000 : 1);
                  }}
                  className="ui-input w-auto"
                >
                  <option value="MIN_EARNINGS_INR">Minimum Contract Revenue (INR)</option>
                  <option value="MIN_PROJECT_COUNT">Minimum Completed Contracts</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Threshold</label>
                <input
                  type="number"
                  value={zkpThreshold}
                  onChange={(e) => setZkpThreshold(e.target.value)}
                  className="ui-input w-36 tabular-nums"
                />
              </div>
              <button type="submit" disabled={busy} className="ui-btn-primary">
                Generate Proof
              </button>
            </form>
          )}

          {profileZkps.length > 0 && (
            <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-lg">
              {profileZkps.map((z) => (
                <div
                  key={z.id}
                  className="p-3.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-medium text-zinc-900">{z.title}</div>
                    <div className="font-mono text-[11px] text-zinc-500">
                      Commitment: {shortHex(z.publicCommitment, 16, 10)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {zkpVerifiedMap[z.id] !== undefined && (
                      <span className="ui-badge bg-emerald-50 text-emerald-800 border-emerald-200">
                        {zkpVerifiedMap[z.id] ? 'Valid' : 'Invalid'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => verifyZkp(z)}
                      className="ui-btn-secondary py-1 px-2.5 text-xs"
                    >
                      Verify
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ledger Activity */}
        <div className="border border-zinc-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-900">On-Chain Registry Activity</span>
            <span className="text-zinc-500">{trustGraph?.networkHealth}</span>
          </div>
          <div className="divide-y divide-zinc-100 text-xs font-mono max-h-44 overflow-y-auto">
            {recentTransactions?.map((tx) => (
              <div key={tx.tx_hash} className="py-2 flex items-center justify-between gap-4">
                <span className="font-sans text-zinc-700 truncate">{tx.summary}</span>
                <span className="text-zinc-400 shrink-0">Block #{tx.block_number}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {vcModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
              <span className="font-semibold text-sm">W3C Verifiable Credential</span>
              <button
                type="button"
                onClick={() => setVcModal(null)}
                className="ui-btn-secondary py-1 px-2.5 text-xs"
              >
                Close
              </button>
            </div>
            <div className="p-4 overflow-y-auto bg-zinc-950 text-zinc-200 text-xs font-mono">
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(vcModal.vcDocument, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {qrModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-lg shadow-xl max-w-xs w-full p-6 text-center space-y-3">
            <h3 className="text-sm font-semibold text-zinc-900">{qrModal.cred.projectTitle}</h3>
            <img src={qrModal.dataUrl} alt="QR Code" className="w-48 h-48 mx-auto border border-zinc-200 rounded p-2" />
            <button
              type="button"
              onClick={() => setQrModal(null)}
              className="ui-btn-primary w-full"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {editModal && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditModal(false)}
          onSaved={async () => {
            setEditModal(false);
            await onRefresh();
            showToast('Profile saved.');
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
      await apiFetch('/api/profile', {
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white border border-zinc-200 rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
          <h3 className="text-base font-semibold text-zinc-900">Edit Profile</h3>
          <button type="button" onClick={onClose} className="ui-btn-secondary py-1 px-2.5 text-xs">
            Cancel
          </button>
        </div>
        <form onSubmit={handleSave} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="ui-input"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Hourly rate (INR)</label>
              <input
                type="number"
                required
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className="ui-input tabular-nums"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-zinc-700 mb-1">Headline</label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="ui-input"
            />
          </div>
          <div>
            <label className="block font-medium text-zinc-700 mb-1">Bio</label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="ui-input"
            />
          </div>
          <div>
            <label className="block font-medium text-zinc-700 mb-1">Skills</label>
            <input
              type="text"
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              className="ui-input"
            />
          </div>
          <button type="submit" disabled={busy} className="ui-btn-primary w-full py-2">
            {busy ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}
