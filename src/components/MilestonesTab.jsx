import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  GitCommit,
  Upload,
  CheckCircle2,
  Clock,
  Award,
  ExternalLink,
  Lock,
} from 'lucide-react';
import {
  apiFetch,
  formatCurrency,
  shortHex,
  signDigestWithBrowserWallet,
} from '../lib/wallet.js';

export default function MilestonesTab({
  agreements,
  credentials,
  activePersona,
  selectedAgreementId,
  setSelectedAgreementId,
  onRefresh,
  onNavigate,
  showToast,
}) {
  const anchoredAgreements = useMemo(
    () => agreements.filter((a) => a.status === 'ACTIVE' || a.status === 'COMPLETED'),
    [agreements]
  );

  const selectedAg = useMemo(() => {
    return (
      anchoredAgreements.find((a) => a.id === selectedAgreementId) ||
      anchoredAgreements[0] ||
      null
    );
  }, [anchoredAgreements, selectedAgreementId]);

  const [evidenceModalMs, setEvidenceModalMs] = useState(null);
  const [issueVcModal, setIssueVcModal] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const existingVcForAgreement = useMemo(() => {
    if (!selectedAg) return null;
    return credentials.find((c) => c.agreementId === selectedAg.id) || null;
  }, [credentials, selectedAg]);

  async function handleClientSignOff(ms) {
    if (!selectedAg || !activePersona) return;
    if (activePersona.did !== selectedAg.clientDid) {
      showToast(
        `Switch Signing Identity in the top header to ${selectedAg.clientName} (Gig Provider) to sign off this milestone!`,
        'error'
      );
      return;
    }
    setBusyId(ms.id);
    try {
      let extSig = null;
      if (!activePersona.hasCustodialKey) {
        extSig = await signDigestWithBrowserWallet(activePersona.address, ms.signingDigest);
      }
      const res = await apiFetch(`/api/milestones/${ms.id}/sign-off`, {
        method: 'POST',
        body: JSON.stringify({
          actorDid: activePersona.did,
          signature: extSig,
        }),
      });
      showToast(
        res.agreementCompleted
          ? `Milestone verified on-chain at Block #${res.receipt.blockNumber} & Agreement marked COMPLETED! Ready to issue W3C Credential.`
          : `Milestone #${ms.index} cryptographically signed off at Block #${res.receipt.blockNumber}!`
      );
      await onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="brutal-card p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 bg-[#F59E0B] border border-[#111827]">
            SLIDE 04 &amp; 07 · EVIDENCE-BACKED DELIVERABLE PROOFS
          </span>
          <h2 className="text-xl font-bold mt-1">
            Milestone Deliverable Proofs &amp; Cryptographic Client Sign-Off
          </h2>
          <p className="text-xs text-slate-600">
            Freelancers attach Git commit hashes &amp; IPFS deliverable proofs; Gig Providers co-sign completion on-chain and mint W3C Verifiable Credentials.
          </p>
        </div>

        {selectedAg && (
          <div className="flex items-center gap-2">
            <select
              value={selectedAg.id}
              onChange={(e) => setSelectedAgreementId(e.target.value)}
              className="brutal-input text-xs font-bold max-w-xs"
            >
              {anchoredAgreements.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} (v{a.version} · {a.status})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!selectedAg ? (
        <div className="brutal-card p-8 bg-white text-center text-sm">
          No anchored agreements yet. Co-sign a Digital Agreement first!
        </div>
      ) : (
        <div className="space-y-4">
          {/* Selected Agreement Summary + Issue W3C Credential CTA */}
          <div className="brutal-card p-4 bg-[#FAF7F0] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-mono text-slate-600">
                Agreement v{selectedAg.version} · {selectedAg.clientName} (Client) ↔{' '}
                {selectedAg.freelancerName} (Freelancer)
              </div>
              <h3 className="font-bold text-lg">{selectedAg.title}</h3>
              <div className="text-xs font-mono mt-1">
                Verified Milestones:{' '}
                <strong>
                  {selectedAg.milestones.filter((m) => m.status === 'VERIFIED_ONCHAIN').length} /{' '}
                  {selectedAg.milestones.length}
                </strong>{' '}
                · Total Value: <strong>{formatCurrency(selectedAg.totalCost, selectedAg.currency)}</strong>
              </div>
            </div>

            <div>
              {existingVcForAgreement ? (
                <button
                  type="button"
                  onClick={() => onNavigate('reputation')}
                  className="brutal-btn bg-emerald-100 text-emerald-950 px-4 py-2 text-xs flex items-center gap-1.5"
                >
                  <Award className="w-4 h-4 text-emerald-700" />
                  <span>W3C Credential Issued · View Passport ➔</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (activePersona?.did !== selectedAg.clientDid) {
                      showToast(
                        `Switch Signing Identity to ${selectedAg.clientName} (Gig Provider) to issue the W3C Verifiable Credential.`,
                        'error'
                      );
                      return;
                    }
                    setIssueVcModal(true);
                  }}
                  className="brutal-btn bg-[#E11D48] text-white px-4 py-2 text-xs flex items-center gap-1.5"
                >
                  <Award className="w-4 h-4" />
                  <span>Issue W3C Verifiable Credential</span>
                </button>
              )}
            </div>
          </div>

          {/* Milestones List */}
          <div className="grid grid-cols-1 gap-4">
            {selectedAg.milestones.map((ms) => (
              <div key={ms.id} className="brutal-card p-5 bg-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 bg-slate-900 text-white">
                        MILESTONE #{ms.index}
                      </span>
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 border ${
                          ms.status === 'VERIFIED_ONCHAIN'
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-800'
                            : ms.status === 'EVIDENCE_SUBMITTED'
                              ? 'bg-amber-100 text-amber-900 border-amber-800'
                              : 'bg-slate-100 text-slate-700 border-slate-600'
                        }`}
                      >
                        {ms.status}
                      </span>
                    </div>
                    <h4 className="font-bold text-base mt-1.5">{ms.title}</h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Deliverables: {ms.deliverables} · Due: {ms.dueDate}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm">
                      {formatCurrency(ms.amount, selectedAg.currency)}
                    </span>

                    {ms.status === 'PENDING' && selectedAg.status === 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (activePersona?.did !== selectedAg.freelancerDid) {
                            showToast(
                              `Switch Signing Identity to ${selectedAg.freelancerName} (Freelancer) to submit deliverable evidence!`,
                              'error'
                            );
                            return;
                          }
                          setEvidenceModalMs(ms);
                        }}
                        className="brutal-btn bg-[#F59E0B] text-[#111827] px-3 py-1.5 text-xs flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Submit Deliverable Evidence</span>
                      </button>
                    )}

                    {ms.status === 'EVIDENCE_SUBMITTED' && selectedAg.status === 'ACTIVE' && (
                      <button
                        type="button"
                        disabled={busyId === ms.id}
                        onClick={() => handleClientSignOff(ms)}
                        className="brutal-btn bg-[#059669] text-white px-3.5 py-1.5 text-xs flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {busyId === ms.id ? 'Signing Off...' : 'Client Sign-Off & Anchor On-Chain'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Evidence Payload Display */}
                {ms.deliverableHash && (
                  <div className="mt-3 p-3 bg-[#FAF7F0] border border-[#111827] text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center gap-4 font-mono text-[11px]">
                      <span className="flex items-center gap-1 font-bold text-slate-800">
                        <GitCommit className="w-3.5 h-3.5 text-[#E11D48]" />
                        Commit: {ms.commitHash || 'N/A'}
                      </span>
                      <span>IPFS Evidence CID: {shortHex(ms.evidenceCid, 16, 8)}</span>
                      <span>Keccak-256 Proof: {shortHex(ms.deliverableHash, 14, 8)}</span>
                    </div>
                    {ms.evidenceNotes && <p className="text-slate-700">{ms.evidenceNotes}</p>}
                    {ms.txHash && (
                      <div className="text-[11px] font-mono text-emerald-800 font-bold pt-1 border-t border-slate-300">
                        ✓ Dual-Signed &amp; Anchored on TrustWorkProtocol.sol · Block #{ms.blockNumber} · Tx {shortHex(ms.txHash, 14, 10)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit Deliverable Evidence Modal */}
      {evidenceModalMs && selectedAg && (
        <SubmitEvidenceModal
          milestone={evidenceModalMs}
          agreement={selectedAg}
          activePersona={activePersona}
          onClose={() => setEvidenceModalMs(null)}
          onSubmitted={async () => {
            setEvidenceModalMs(null);
            await onRefresh();
            showToast(
              `Deliverable proof hashed, pinned to IPFS & signed! Switch to ${selectedAg.clientName} to sign off on-chain.`
            );
          }}
          showToast={showToast}
        />
      )}

      {/* Issue W3C Verifiable Credential Modal */}
      {issueVcModal && selectedAg && (
        <IssueCredentialModal
          agreement={selectedAg}
          activePersona={activePersona}
          onClose={() => setIssueVcModal(false)}
          onIssued={async () => {
            setIssueVcModal(false);
            await onRefresh();
            showToast('W3C Verifiable Credential minted & anchored on TrustWorkProtocol.sol!');
            onNavigate('reputation');
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function SubmitEvidenceModal({ milestone, agreement, activePersona, onClose, onSubmitted, showToast }) {
  const [commitHash, setCommitHash] = useState('e49a71c308bf19d4421a87e0c2155b908f12ca19');
  const [repoUrl, setRepoUrl] = useState(
    'https://github.com/trustwork-deliverables/repo/commit/e49a71c308bf'
  );
  const [evidenceNotes, setEvidenceNotes] = useState(
    `Completed ${milestone.title}. All acceptance criteria verified with automated integration tests.`
  );
  const [artifactContent, setArtifactContent] = useState(
    JSON.stringify(
      {
        milestone: milestone.title,
        testSuitePassed: true,
        coveragePercent: 96.8,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/milestones/${milestone.id}/submit-evidence`, {
        method: 'POST',
        body: JSON.stringify({
          actorDid: activePersona.did,
          commitHash,
          repoUrl,
          evidenceNotes,
          artifactName: `milestone-${milestone.index}-proof.json`,
          artifactContent,
        }),
      });
      await onSubmitted();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="brutal-card bg-white max-w-xl w-full p-5 space-y-4">
        <div className="flex items-center justify-between border-b-2 border-[#111827] pb-2">
          <h3 className="font-bold text-base">Submit Cryptographic Deliverable Proof</h3>
          <button type="button" onClick={onClose} className="brutal-btn bg-white px-2.5 py-1 text-xs">
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-mono font-bold mb-1">Git Commit SHA-1 / SHA-256</label>
            <input
              type="text"
              required
              value={commitHash}
              onChange={(e) => setCommitHash(e.target.value)}
              className="brutal-input w-full font-mono text-xs"
            />
          </div>
          <div>
            <label className="block font-mono font-bold mb-1">Repository / Deliverable URL</label>
            <input
              type="url"
              required
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="brutal-input w-full text-xs"
            />
          </div>
          <div>
            <label className="block font-mono font-bold mb-1">Engineering Handover Summary</label>
            <textarea
              rows={2}
              required
              value={evidenceNotes}
              onChange={(e) => setEvidenceNotes(e.target.value)}
              className="brutal-input w-full text-xs"
            />
          </div>
          <div>
            <label className="block font-mono font-bold mb-1">
              Deliverable Manifest Content (Pinned to IPFS CIDv1)
            </label>
            <textarea
              rows={4}
              value={artifactContent}
              onChange={(e) => setArtifactContent(e.target.value)}
              className="brutal-input w-full font-mono text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="brutal-btn bg-[#111827] text-white px-4 py-2 text-xs w-full"
          >
            {busy ? 'Hashing & Signing...' : 'Pin to IPFS & Sign Deliverable Proof'}
          </button>
        </form>
      </div>
    </div>
  );
}

function IssueCredentialModal({ agreement, activePersona, onClose, onIssued, showToast }) {
  const [rolePerformed, setRolePerformed] = useState('Lead Systems & Smart Contract Engineer');
  const [summaryStatement, setSummaryStatement] = useState(
    `${agreement.freelancerName} completed ${agreement.title} with verified deliverable proofs.`
  );
  const [skillsInput, setSkillsInput] = useState('Distributed Systems, Rust, Cryptography, Zero-Trust APIs');
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/credentials/issue', {
        method: 'POST',
        body: JSON.stringify({
          agreementId: agreement.id,
          issuerDid: activePersona.did,
          rolePerformed,
          summaryStatement,
          skillsVerified: skillsInput
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          rating: Number(rating),
        }),
      });
      await onIssued();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="brutal-card bg-white max-w-xl w-full p-5 space-y-4">
        <div className="flex items-center justify-between border-b-2 border-[#111827] pb-2">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase bg-[#E11D48] text-white px-2 py-0.5">
              W3C VERIFIABLE CREDENTIAL ISSUANCE
            </span>
            <h3 className="font-bold text-base mt-1">
              Mint Portable Credential for {agreement.freelancerName}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="brutal-btn bg-white px-2.5 py-1 text-xs">
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-mono font-bold mb-1">Role Performed</label>
            <input
              type="text"
              required
              value={rolePerformed}
              onChange={(e) => setRolePerformed(e.target.value)}
              className="brutal-input w-full text-xs"
            />
          </div>
          <div>
            <label className="block font-mono font-bold mb-1">Verified Achievement Statement</label>
            <textarea
              rows={2}
              required
              value={summaryStatement}
              onChange={(e) => setSummaryStatement(e.target.value)}
              className="brutal-input w-full text-xs"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block font-mono font-bold mb-1">Certified Skills (comma-separated)</label>
              <input
                type="text"
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
                className="brutal-input w-full text-xs"
              />
            </div>
            <div>
              <label className="block font-mono font-bold mb-1">Performance Rating</label>
              <select
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="brutal-input w-full text-xs font-mono"
              >
                <option value={5}>5 / 5 ★ Exemplary</option>
                <option value={4}>4 / 5 ★ Strong</option>
                <option value={3}>3 / 5 ★ Satisfactory</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="brutal-btn bg-[#E11D48] text-white px-4 py-2 text-xs w-full"
          >
            {busy ? 'Signing & Anchoring W3C VC...' : 'Sign with Issuer Key & Anchor W3C VC On-Chain'}
          </button>
        </form>
      </div>
    </div>
  );
}
