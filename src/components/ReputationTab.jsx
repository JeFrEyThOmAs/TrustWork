import React, { useMemo, useState } from 'react';
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
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch, formatCurrency, shortHex, tierMeta } from '../lib/wallet.js';

export default function ReputationTab({
  identities,
  credentials,
  zkpProofs,
  activePersona,
  onRefresh,
  onOpenAudit,
  showToast,
}) {
  const freelancers = useMemo(
    () => identities.filter((i) => i.role !== 'CLIENT'),
    [identities]
  );

  const [selectedDid, setSelectedDid] = useState(
    freelancers[0]?.did || identities[0]?.did || ''
  );
  const [vcModal, setVcModal] = useState(null);
  const [qrModal, setQrModal] = useState(null);
  const [zkpThreshold, setZkpThreshold] = useState(1000000);
  const [zkpClaimType, setZkpClaimType] = useState('MIN_EARNINGS_INR');
  const [zkpVerifyStatus, setZkpVerifyStatus] = useState({});
  const [busy, setBusy] = useState(false);

  const profile = useMemo(
    () => identities.find((i) => i.did === selectedDid) || identities[0],
    [identities, selectedDid]
  );

  const subjectCreds = useMemo(
    () => credentials.filter((c) => c.subjectDid === profile?.did),
    [credentials, profile]
  );

  const subjectZkps = useMemo(
    () => zkpProofs.filter((z) => z.subjectDid === profile?.did),
    [zkpProofs, profile]
  );

  function downloadVcJson(cred) {
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

  async function openQrWallet(cred) {
    const verificationPacket = JSON.stringify({
      protocol: 'TrustWork-v2',
      credentialId: cred.id,
      vcHash: cred.vcHash,
      subjectDid: cred.subjectDid,
      issuerDid: cred.issuerDid,
      blockNumber: cred.blockNumber,
    });
    const dataUrl = await QRCode.toDataURL(verificationPacket, {
      width: 260,
      margin: 2,
      color: { dark: '#111827', light: '#FAF7F0' },
    });
    setQrModal({ cred, dataUrl, verificationPacket });
  }

  async function handleRevoke(cred) {
    if (activePersona?.did !== cred.issuerDid) {
      showToast(
        `Only the original Issuer (${cred.issuerName}) can revoke this credential on-chain! Switch Signing Identity above.`,
        'error'
      );
      return;
    }
    const reason = window.prompt(
      'Enter on-chain revocation reason (recorded permanently in Revocation Registry):',
      'Disputed post-delivery SLA breach'
    );
    if (!reason) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/credentials/${cred.id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ actorDid: activePersona.did, reason }),
      });
      showToast(`Credential revoked on-chain at Block #${res.receipt.blockNumber}`);
      await onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateZkp(e) {
    e.preventDefault();
    if (!profile) return;
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
      showToast('Zero-Knowledge Selective Disclosure Proof generated!');
      await onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyZkp(zkpItem) {
    try {
      const res = await apiFetch('/api/zkp/verify', {
        method: 'POST',
        body: JSON.stringify({ proof: zkpItem.proof }),
      });
      setZkpVerifyStatus({ ...zkpVerifyStatus, [zkpItem.id]: res });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (!profile) return null;

  return (
    <div className="space-y-5">
      {/* Freelancer Selector */}
      <div className="brutal-card p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 bg-[#059669] text-white border border-[#111827]">
            100% PORTABLE PROFESSIONAL REPUTATION PASSPORT
          </span>
          <h2 className="text-xl font-bold mt-1">
            Self-Controlled DID Passport &amp; W3C Verifiable Credentials
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold">Inspect Passport:</span>
          <select
            value={profile.did}
            onChange={(e) => setSelectedDid(e.target.value)}
            className="brutal-input text-xs font-bold"
          >
            {identities.map((id) => (
              <option key={id.did} value={id.did}>
                {id.name} ({id.role})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Passport Hero Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 brutal-card p-6 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 bg-[#111827] text-[#F59E0B] font-mono text-xs font-bold">
                  {profile.did}
                </span>
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 border ${tierMeta(profile.issuerTier).bg}`}
                >
                  {tierMeta(profile.issuerTier).label}
                </span>
              </div>
              <h3 className="text-2xl font-bold mt-2">{profile.name}</h3>
              <p className="text-sm font-semibold text-slate-700">{profile.headline}</p>
              <p className="text-xs text-slate-600 mt-2">{profile.bio}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-4">
            {profile.skills.map((skill) => (
              <span
                key={skill}
                className="px-2.5 py-1 bg-[#FAF7F0] border border-[#111827] text-xs font-mono font-semibold"
              >
                ✓ {skill}
              </span>
            ))}
          </div>
        </div>

        {/* Evidence Score Box */}
        <div className="lg:col-span-4 brutal-dark p-5 flex flex-col justify-between">
          <div>
            <span className="text-xs font-mono uppercase text-[#F59E0B] font-bold">
              TRUSTWORK EVIDENCE SCORE
            </span>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="text-5xl font-bold font-mono text-emerald-400">
                {profile.reputation?.evidenceScore ?? 0}
              </span>
              <span className="text-sm font-mono text-slate-300">/ 100</span>
            </div>
            <div className="text-xs font-mono text-sky-300 mt-1">
              Grade: {profile.reputation?.trustGrade}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-700 text-xs font-mono">
            <div>
              <span className="text-slate-400 block text-[10px]">ACTIVE W3C VCs</span>
              <span className="font-bold text-white">
                {profile.reputation?.breakdown?.activeCredentials}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">VERIFIED MILESTONES</span>
              <span className="font-bold text-white">
                {profile.reputation?.breakdown?.verifiedMilestones}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">ENTERPRISE ISSUERS</span>
              <span className="font-bold text-[#F59E0B]">
                {profile.reputation?.breakdown?.enterpriseEndorsements}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">SYBIL RESISTANCE</span>
              <span className="font-bold text-emerald-400">
                {profile.reputation?.fraudAnalysis?.sybilResistanceScore}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* W3C Verifiable Credentials Gallery */}
      <div className="space-y-3">
        <h3 className="font-bold text-lg">
          Cryptographically Signed W3C Verifiable Credentials ({subjectCreds.length})
        </h3>

        {subjectCreds.length === 0 ? (
          <div className="brutal-card p-6 bg-white text-xs text-slate-600">
            No W3C Verifiable Credentials issued to {profile.name} yet. Complete an agreement milestone and issue one!
          </div>
        ) : (
          subjectCreds.map((cred) => (
            <div
              key={cred.id}
              className={`brutal-card p-5 ${cred.revoked ? 'bg-red-50/70' : 'bg-white'}`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {cred.revoked ? (
                      <span className="text-xs font-mono font-bold px-2 py-0.5 bg-red-700 text-white">
                        REVOKED ON-CHAIN ({cred.revocationReason})
                      </span>
                    ) : (
                      <span className="text-xs font-mono font-bold px-2 py-0.5 bg-emerald-100 text-emerald-950 border border-emerald-900">
                        ✓ VALID ON-CHAIN W3C CREDENTIAL · BLOCK #{cred.blockNumber}
                      </span>
                    )}
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 border ${tierMeta(cred.issuerTier).bg}`}
                    >
                      ISSUER: {cred.issuerName} ({cred.issuerTier})
                    </span>
                  </div>

                  <h4 className="font-bold text-lg mt-2">{cred.projectTitle}</h4>
                  <p className="text-sm font-medium text-slate-800 mt-0.5">
                    &ldquo;{cred.summaryStatement}&rdquo;
                  </p>
                  <div className="text-xs text-slate-600 mt-1">
                    Role: <strong>{cred.rolePerformed}</strong> · Deliverable Hashes Anchored:{' '}
                    <strong>{cred.deliverableHashes.length}</strong> · Rating:{' '}
                    <strong>{'★'.repeat(cred.rating)}</strong>
                  </div>
                </div>

                {/* Portable Credential Actions */}
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setVcModal(cred)}
                    className="brutal-btn bg-white px-3 py-1.5 text-xs flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>JSON-LD</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadVcJson(cred)}
                    className="brutal-btn bg-[#FAF7F0] px-3 py-1.5 text-xs flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export .vc.json</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openQrWallet(cred)}
                    className="brutal-btn bg-[#F59E0B] text-[#111827] px-3 py-1.5 text-xs flex items-center gap-1"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>QR Wallet</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAudit('credential', cred.id, cred.vcDocument)}
                    className="brutal-btn bg-[#111827] text-white px-3 py-1.5 text-xs flex items-center gap-1"
                  >
                    <SearchCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>1-Sec Verify</span>
                  </button>
                  {!cred.revoked && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRevoke(cred)}
                      className="brutal-btn bg-rose-100 text-rose-900 px-3 py-1.5 text-xs flex items-center gap-1"
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                      <span>Revoke</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] font-mono text-slate-600 flex flex-wrap gap-4">
                <span>VC Keccak-256: {shortHex(cred.vcHash, 14, 10)}</span>
                <span>IPFS CID: {shortHex(cred.ipfsCid, 14, 8)}</span>
                <span>Tx: {shortHex(cred.txHash, 14, 10)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Slide 11: Zero-Knowledge Selective Disclosure Proofs */}
      <div className="brutal-card p-5 bg-white border-t-4 border-t-[#F59E0B] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase bg-[#F59E0B] px-2 py-0.5 border border-[#111827]">
              SLIDE 11 · PRIVACY-PRESERVING ZERO-KNOWLEDGE PROOFS (ZKPs)
            </span>
            <h3 className="font-bold text-base mt-1">
              Selective Disclosure Claims (Prove Contract Thresholds Without Exposing Confidential Clients)
            </h3>
          </div>
        </div>

        <form onSubmit={handleGenerateZkp} className="flex flex-wrap items-end gap-3 text-xs">
          <div>
            <label className="block font-mono font-bold mb-1">Claim Type</label>
            <select
              value={zkpClaimType}
              onChange={(e) => {
                setZkpClaimType(e.target.value);
                setZkpThreshold(e.target.value === 'MIN_EARNINGS_INR' ? 1000000 : 1);
              }}
              className="brutal-input text-xs"
            >
              <option value="MIN_EARNINGS_INR">Minimum Total Verified Contract Value (INR)</option>
              <option value="MIN_PROJECT_COUNT">Minimum Verified Enterprise Projects</option>
            </select>
          </div>
          <div>
            <label className="block font-mono font-bold mb-1">Public Threshold</label>
            <input
              type="number"
              value={zkpThreshold}
              onChange={(e) => setZkpThreshold(e.target.value)}
              className="brutal-input text-xs font-mono w-40"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="brutal-btn bg-[#111827] text-white px-4 py-2 text-xs"
          >
            Generate ZKP Commitment Proof
          </button>
        </form>

        <div className="space-y-2">
          {subjectZkps.map((z) => {
            const vStat = zkpVerifyStatus[z.id];
            return (
              <div
                key={z.id}
                className="p-3 bg-[#FAF7F0] border border-[#111827] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-bold">{z.title}</div>
                  <div className="font-mono text-[11px] text-slate-600">
                    Public Commitment: {shortHex(z.publicCommitment, 18, 10)} · Anchored VCs:{' '}
                    {z.proof.credentialCount}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {vStat && (
                    <span
                      className={`font-mono font-bold px-2 py-0.5 border ${
                        vStat.valid
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-800'
                          : 'bg-red-100 text-red-900 border-red-800'
                      }`}
                    >
                      {vStat.valid ? '✓ ZKP VALID' : '✗ INVALID'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleVerifyZkp(z)}
                    className="brutal-btn bg-white px-3 py-1 text-xs"
                  >
                    Verify ZKP Math
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* JSON-LD Modal */}
      {vcModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="brutal-card bg-white max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="p-4 border-b-2 border-[#111827] bg-[#FAF7F0] flex items-center justify-between">
              <span className="font-mono font-bold text-xs">
                W3C Verifiable Credential JSON-LD Document
              </span>
              <button
                type="button"
                onClick={() => setVcModal(null)}
                className="brutal-btn bg-white px-3 py-1 text-xs"
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

      {/* Mobile Wallet QR Modal (Slide 11) */}
      {qrModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="brutal-card bg-[#FAF7F0] max-w-md w-full p-5 text-center space-y-3">
            <span className="text-[10px] font-mono font-bold uppercase bg-[#059669] text-white px-2 py-0.5">
              SLIDE 11 · MOBILE DID CREDENTIAL WALLET QR
            </span>
            <h3 className="font-bold text-base">{qrModal.cred.projectTitle}</h3>
            <p className="text-xs text-slate-600">
              Present this QR code during technical interviews for an instant 1-second cryptographic blockchain audit.
            </p>
            <div className="bg-white border-2 border-[#111827] p-3 inline-block mx-auto">
              <img src={qrModal.dataUrl} alt="Credential QR Code" className="w-56 h-56 mx-auto" />
            </div>
            <div className="text-[11px] font-mono text-slate-600 break-all">
              VC Hash: {qrModal.cred.vcHash}
            </div>
            <button
              type="button"
              onClick={() => setQrModal(null)}
              className="brutal-btn bg-[#111827] text-white px-4 py-2 text-xs w-full"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
