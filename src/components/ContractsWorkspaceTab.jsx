import React, { useMemo, useState } from 'react';
import {
  Plus,
  Check,
  Clock,
  ArrowRight,
  Lock,
  Send,
} from 'lucide-react';
import {
  agreementStatusMeta,
  apiFetch,
  formatCurrency,
  shortHex,
  signDigestWithBrowserWallet,
  tierMeta,
} from '../lib/wallet.js';
import { CryptoSignModal } from './CryptoSignModal.jsx';

export default function ContractsWorkspaceTab({
  agreements,
  credentials,
  messages,
  identities,
  currentUser,
  selectedAgreementId,
  setSelectedAgreementId,
  directHirePrefill,
  clearDirectHirePrefill,
  onOpenAudit,
  onNavigate,
  onRefresh,
  showToast,
}) {
  const [subView, setSubView] = useState('terms');
  const [createOpen, setCreateOpen] = useState(Boolean(directHirePrefill));
  const [amendTarget, setAmendTarget] = useState(null);
  const [tamperModal, setTamperModal] = useState(null);
  const [tamperResult, setTamperResult] = useState(null);
  const [evidenceModalMs, setEvidenceModalMs] = useState(null);
  const [issueVcModal, setIssueVcModal] = useState(false);
  const [cryptoPrompt, setCryptoPrompt] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (directHirePrefill) setCreateOpen(true);
  }, [directHirePrefill]);

  const selected = useMemo(() => {
    return (
      agreements.find((a) => a.id === selectedAgreementId) || agreements[0] || null
    );
  }, [agreements, selectedAgreementId]);

  const lineage = useMemo(() => {
    if (!selected) return [];
    return agreements
      .filter((a) => a.rootAgreementId === selected.rootAgreementId)
      .sort((a, b) => a.version - b.version);
  }, [agreements, selected]);

  const parentAgreement = useMemo(() => {
    if (!selected?.parentAgreementId) return null;
    return agreements.find((a) => a.id === selected.parentAgreementId) || null;
  }, [agreements, selected]);

  const pendingChildAmendment = useMemo(() => {
    if (!selected) return null;
    return (
      agreements.find(
        (a) => a.parentAgreementId === selected.id && a.status === 'AMENDMENT_PENDING'
      ) || null
    );
  }, [agreements, selected]);

  const workspaceMessages = useMemo(() => {
    if (!selected) return [];
    return messages.filter(
      (m) => m.threadId === selected.rootAgreementId || m.threadId === selected.id
    );
  }, [messages, selected]);

  const existingVc = useMemo(() => {
    if (!selected) return null;
    return credentials.find((c) => c.agreementId === selected.id) || null;
  }, [credentials, selected]);

  async function maybeExternalSig(digestHex) {
    if (!currentUser?.usesExternalWallet) return null;
    return signDigestWithBrowserWallet(currentUser.address, digestHex);
  }

  function handleCoSignInitial(ag) {
    setCryptoPrompt({
      title: `Co-Sign Digital Agreement v1 — ${ag.title}`,
      subtitle: 'Verify the Keccak-256 hash and sign with your Private Key to anchor this agreement on the blockchain.',
      termsHash: ag.termsHash,
      signingDigest: ag.signingDigest,
      onSigned: async (signatureHex) => {
        const res = await apiFetch(`/api/agreements/${ag.id}/cosign`, {
          method: 'POST',
          body: JSON.stringify({ signature: signatureHex }),
        });
        setCryptoPrompt(null);
        await onRefresh();
        showToast(`Dual signatures verified! Agreement v1 anchored on-chain (Block #${res.receipt.blockNumber}).`);
      },
    });
  }

  function handleCoSignAmendment(proposal) {
    setCryptoPrompt({
      title: `Approve & Co-Sign Modified Agreement v${proposal.version}`,
      subtitle: `Both parties must sign to supersede v${proposal.version - 1} and mint v${proposal.version} on-chain.`,
      termsHash: proposal.termsHash,
      signingDigest: proposal.signingDigest,
      onSigned: async (signatureHex) => {
        const res = await apiFetch(`/api/agreements/${proposal.id}/cosign-amendment`, {
          method: 'POST',
          body: JSON.stringify({ signature: signatureHex }),
        });
        setCryptoPrompt(null);
        setSelectedAgreementId(proposal.id);
        await onRefresh();
        showToast(
          `Mutual modification co-signed! New Agreement v${proposal.version} anchored at Block #${res.receipt.blockNumber}.`
        );
      },
    });
  }

  async function handleDecline(ag) {
    setBusy(true);
    try {
      await apiFetch(`/api/agreements/${ag.id}/reject`, { method: 'POST', body: '{}' });
      await onRefresh();
      showToast('Proposal declined.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function handleMilestoneSignOff(ms) {
    setCryptoPrompt({
      title: `Approve & Sign Off ${ms.title}`,
      subtitle: 'Sign the deliverable proof digest with your Private Key to verify completion on-chain.',
      termsHash: ms.deliverableHash,
      signingDigest: ms.signingDigest,
      onSigned: async (signatureHex) => {
        const res = await apiFetch(`/api/milestones/${ms.id}/sign-off`, {
          method: 'POST',
          body: JSON.stringify({ signature: signatureHex }),
        });
        setCryptoPrompt(null);
        await onRefresh();
        showToast(
          res.agreementCompleted
            ? 'All milestones approved and contract marked completed on-chain.'
            : `Milestone #${ms.index} approved on-chain (Block #${res.receipt.blockNumber}).`
        );
      },
    });
  }

  async function handleSendChat(e) {
    e.preventDefault();
    if (!chatInput.trim() || !selected) return;
    try {
      await apiFetch('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          threadId: selected.rootAgreementId,
          body: chatInput,
        }),
      });
      setChatInput('');
      await onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function runTamperTest(e) {
    e.preventDefault();
    if (!tamperModal) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/agreements/${tamperModal.agreement.id}/simulate-tamper`, {
        method: 'POST',
        body: JSON.stringify({
          tamperedCost: Number(tamperModal.tamperedCost),
          tamperedDeadline: tamperModal.tamperedDeadline,
          tamperedFeatureTitle: tamperModal.tamperedFeatureTitle,
        }),
      });
      setTamperResult(res);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const needsMyInitialSig =
    selected?.status === 'PENDING_SIGNATURES' &&
    ((selected.clientDid === currentUser?.did && !selected.clientSignature) ||
      (selected.freelancerDid === currentUser?.did && !selected.freelancerSignature));

  const needsMyAmendmentSig =
    selected?.status === 'AMENDMENT_PENDING' &&
    ((selected.clientDid === currentUser?.did && !selected.clientSignature) ||
      (selected.freelancerDid === currentUser?.did && !selected.freelancerSignature));

  const otherUsersExist = identities.filter((u) => u.did !== currentUser?.did).length > 0;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Top Bar */}
      <div className="h-14 shrink-0 border-b border-zinc-200 px-6 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-zinc-900">
          Digital Agreements ({agreements.length})
        </h1>
        <button
          type="button"
          onClick={() => {
            if (!otherUsersExist) {
              showToast(
                'Register a second user account in another browser (or hire from an open gig) so you have a counterparty.',
                'error'
              );
              return;
            }
            setCreateOpen(true);
          }}
          className="ui-btn-primary flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Digital Agreement</span>
        </button>
      </div>

      {agreements.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-sm text-center space-y-2">
            <div className="text-sm font-semibold text-zinc-900">No agreements yet</div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Digital Agreements are created when you accept a freelancer&apos;s proposal on a gig or draft a direct agreement from the Directory. Both parties must sign before the agreement is anchored on the blockchain.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
          {/* Left Agreement List */}
          <div className="lg:col-span-4 border-r border-zinc-200 overflow-y-auto divide-y divide-zinc-200">
            {agreements.map((ag) => {
              const active = selected?.id === ag.id;
              const sMeta = agreementStatusMeta(ag.status);
              const myTurn =
                (ag.status === 'PENDING_SIGNATURES' || ag.status === 'AMENDMENT_PENDING') &&
                ((ag.clientDid === currentUser?.did && !ag.clientSignature) ||
                  (ag.freelancerDid === currentUser?.did && !ag.freelancerSignature));

              return (
                <div
                  key={ag.id}
                  onClick={() => setSelectedAgreementId(ag.id)}
                  className={`p-4 cursor-pointer transition ${
                    active ? 'bg-zinc-50' : 'hover:bg-zinc-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`ui-badge ${sMeta.cls}`}>
                      {sMeta.label} · v{ag.version}
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-zinc-900">
                      {formatCurrency(ag.totalCost, ag.currency)}
                    </span>
                  </div>
                  <div className="font-semibold text-sm text-zinc-900 mt-2">{ag.title}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {ag.clientName} ↔ {ag.freelancerName}
                  </div>
                  <div className="flex items-center justify-between mt-2.5 text-[11px] text-zinc-500">
                    <span>Deadline {ag.deadline}</span>
                    {myTurn ? (
                      <span className="text-amber-700 font-medium">Signature required</span>
                    ) : ag.blockNumber ? (
                      <span className="font-mono text-zinc-600">Block #{ag.blockNumber}</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Workspace Pane */}
          {selected && (
            <div className="lg:col-span-8 flex flex-col min-h-0">
              {/* Sub-header with Version Chain & Sub-tabs */}
              <div className="px-6 py-3 border-b border-zinc-200 bg-zinc-50/50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-zinc-500 mr-1">Versions:</span>
                  {lineage.map((ver, idx) => (
                    <React.Fragment key={ver.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedAgreementId(ver.id)}
                        className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                          ver.id === selected.id
                            ? 'bg-zinc-900 text-white'
                            : 'bg-white border border-zinc-200 text-zinc-700'
                        }`}
                      >
                        v{ver.version} ({agreementStatusMeta(ver.status).label})
                      </button>
                      {idx < lineage.length - 1 && (
                        <ArrowRight className="w-3 h-3 text-zinc-400" />
                      )}
                    </React.Fragment>
                  ))}
                </div>

                <div className="flex items-center gap-1 bg-zinc-200/70 p-0.5 rounded-md text-xs">
                  {[
                    { id: 'terms', label: 'Agreement Terms' },
                    {
                      id: 'milestones',
                      label: `Deliverables (${selected.milestones?.length || 0})`,
                    },
                    { id: 'messages', label: `Messages (${workspaceMessages.length})` },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSubView(t.id)}
                      className={`px-2.5 py-1 rounded transition cursor-pointer ${
                        subView === t.id
                          ? 'bg-white text-zinc-900 font-medium shadow-2xs'
                          : 'text-zinc-600'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
                {/* Pending Child Modification Notice */}
                {selected.status === 'ACTIVE' && pendingChildAmendment && (
                  <div className="p-4 rounded-lg border border-amber-300 bg-amber-50 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <div className="font-semibold text-amber-950">
                        Modification Request v{pendingChildAmendment.version} Pending
                      </div>
                      <div className="text-amber-800 mt-0.5">
                        Version {selected.version} remains active on-chain until both parties sign v{pendingChildAmendment.version}.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAgreementId(pendingChildAmendment.id)}
                      className="ui-btn-primary shrink-0"
                    >
                      Review Modification
                    </button>
                  </div>
                )}

                {/* Initial Co-Sign Callout */}
                {selected.status === 'PENDING_SIGNATURES' && (
                  <div className="p-4 rounded-lg border border-amber-300 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-amber-950">
                        {needsMyInitialSig
                          ? 'Your signature is required to store this agreement on the blockchain'
                          : `Waiting for ${
                              !selected.clientSignature
                                ? selected.clientName
                                : selected.freelancerName
                            } to co-sign`}
                      </div>
                      <div className="text-amber-800 mt-0.5">
                        Once both parties sign, timeline, cost, and features become tamper-proof on-chain.
                      </div>
                    </div>
                    {needsMyInitialSig && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleCoSignInitial(selected)}
                          className="ui-btn-primary"
                        >
                          {busy ? 'Anchoring...' : 'Agree & Sign On-Chain'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDecline(selected)}
                          className="ui-btn-secondary"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Amendment Comparison Diff */}
                {parentAgreement && (
                  <div className="border border-zinc-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-semibold text-zinc-900">
                          Modification Summary (v{parentAgreement.version} → v{selected.version}):
                        </span>{' '}
                        <span className="text-zinc-600">{selected.amendmentReason}</span>
                      </div>

                      {selected.status === 'AMENDMENT_PENDING' &&
                        (needsMyAmendmentSig ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleCoSignAmendment(selected)}
                              className="ui-btn-primary"
                            >
                              {busy ? 'Signing...' : `Approve & Mint v${selected.version}`}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDecline(selected)}
                              className="ui-btn-secondary"
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <span className="text-amber-700 font-medium">
                            Awaiting counterparty signature
                          </span>
                        ))}
                    </div>

                    <div className="grid grid-cols-3 divide-x divide-zinc-200 text-xs">
                      <div className="p-3">
                        <div className="text-zinc-500">Compensation</div>
                        <div className="mt-1 tabular-nums">
                          <span className="line-through text-zinc-400 mr-1.5">
                            {formatCurrency(parentAgreement.totalCost, parentAgreement.currency)}
                          </span>
                          <span className="font-semibold text-zinc-900">
                            {formatCurrency(selected.totalCost, selected.currency)}
                          </span>
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="text-zinc-500">Deadline</div>
                        <div className="mt-1 font-mono">
                          <span className="line-through text-zinc-400 mr-1.5">
                            {parentAgreement.deadline}
                          </span>
                          <span className="font-semibold text-zinc-900">{selected.deadline}</span>
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="text-zinc-500">Scope</div>
                        <div className="mt-1 font-medium text-zinc-900 tabular-nums">
                          {parentAgreement.features.length} → {selected.features.length} features
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {subView === 'terms' && (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-zinc-200">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`ui-badge ${agreementStatusMeta(selected.status).cls}`}>
                            {agreementStatusMeta(selected.status).label} · Version {selected.version}
                          </span>
                          <span className="text-xs text-zinc-500">{selected.category}</span>
                        </div>
                        <h2 className="text-lg font-semibold text-zinc-900 mt-1.5">
                          {selected.title}
                        </h2>
                        <p className="text-xs text-zinc-600 mt-1">{selected.summary}</p>
                      </div>

                      <div className="flex flex-wrap gap-2 shrink-0">
                        {selected.status === 'ACTIVE' && !pendingChildAmendment && (
                          <button
                            type="button"
                            onClick={() => setAmendTarget(selected)}
                            className="ui-btn-primary"
                          >
                            Modify Agreement
                          </button>
                        )}
                        {selected.txHash && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setTamperResult(null);
                                setTamperModal({
                                  agreement: selected,
                                  tamperedCost: Math.round(selected.totalCost * 0.5),
                                  tamperedDeadline: selected.deadline,
                                  tamperedFeatureTitle:
                                    (selected.features[0]?.name || 'Scope') + ' (Unilateral Change)',
                                });
                              }}
                              className="ui-btn-secondary"
                            >
                              Verify Tamper Lock
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onOpenAudit('agreement', selected.id, selected.canonicalPayload)
                              }
                              className="ui-btn-secondary"
                            >
                              Audit Hash
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Contracting Parties */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="p-4 border border-zinc-200 rounded-lg space-y-1.5">
                        <div className="flex items-center justify-between text-zinc-500">
                          <span>Gig Provider (Client)</span>
                          <span className={`ui-badge ${tierMeta(selected.clientTier).badge}`}>
                            {tierMeta(selected.clientTier).label}
                          </span>
                        </div>
                        <div className="font-semibold text-sm text-zinc-900">
                          {selected.clientName}
                        </div>
                        <div className="font-mono text-[11px] text-zinc-500 truncate">
                          {selected.clientDid}
                        </div>
                        <div className="pt-2 border-t border-zinc-100">
                          {selected.clientSignature ? (
                            <span className="text-emerald-700 font-mono text-[11px] flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" />
                              Signed ({shortHex(selected.clientSignature, 10, 6)})
                            </span>
                          ) : (
                            <span className="text-amber-700 flex items-center gap-1 text-[11px]">
                              <Clock className="w-3.5 h-3.5" />
                              Pending signature
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-4 border border-zinc-200 rounded-lg space-y-1.5">
                        <div className="flex items-center justify-between text-zinc-500">
                          <span>Freelancer</span>
                          <span className="ui-badge bg-zinc-100 text-zinc-700 border-zinc-200">
                            DID Verified
                          </span>
                        </div>
                        <div className="font-semibold text-sm text-zinc-900">
                          {selected.freelancerName}
                        </div>
                        <div className="font-mono text-[11px] text-zinc-500 truncate">
                          {selected.freelancerDid}
                        </div>
                        <div className="pt-2 border-t border-zinc-100">
                          {selected.freelancerSignature ? (
                            <span className="text-emerald-700 font-mono text-[11px] flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" />
                              Signed ({shortHex(selected.freelancerSignature, 10, 6)})
                            </span>
                          ) : (
                            <span className="text-amber-700 flex items-center gap-1 text-[11px]">
                              <Clock className="w-3.5 h-3.5" />
                              Pending signature
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Commercial & Timeline Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-zinc-200 text-xs">
                      <div>
                        <div className="text-zinc-500">Total compensation</div>
                        <div className="text-base font-semibold text-zinc-900 tabular-nums mt-0.5">
                          {formatCurrency(selected.totalCost, selected.currency)}
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-500">Start date</div>
                        <div className="font-mono font-medium text-zinc-900 mt-1">
                          {selected.startDate}
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-500">Deadline</div>
                        <div className="font-mono font-medium text-zinc-900 mt-1">
                          {selected.deadline}
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-500">Duration</div>
                        <div className="font-medium text-zinc-900 mt-1 tabular-nums">
                          {selected.durationDays} days
                        </div>
                      </div>
                    </div>

                    {/* Features Table */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                        Agreed Features &amp; Acceptance Criteria
                      </h3>
                      <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-200 text-xs">
                        {selected.features.map((f, idx) => (
                          <div key={idx} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <div>
                              <span className="font-medium text-zinc-900">
                                {idx + 1}. {f.name}
                              </span>
                              {f.description && (
                                <span className="text-zinc-500 ml-2">— {f.description}</span>
                              )}
                            </div>
                            <span className="text-zinc-500 shrink-0">{f.acceptanceCriteria}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Cryptographic Record */}
                    <div className="p-4 rounded-lg bg-zinc-950 text-zinc-300 font-mono text-xs space-y-1">
                      <div className="flex items-center gap-1.5 text-zinc-100 font-sans font-medium mb-1">
                        <Lock className="w-3.5 h-3.5" />
                        <span>On-Chain Cryptographic Record</span>
                      </div>
                      <div className="truncate">Agreement ID: {selected.id}</div>
                      <div className="truncate">Keccak-256 Hash: {selected.termsHash}</div>
                      <div className="truncate">IPFS Payload CID: {selected.ipfsCid}</div>
                      {selected.txHash && (
                        <div className="truncate text-emerald-400">
                          Block #{selected.blockNumber} · Tx {selected.txHash}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {subView === 'milestones' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-900">
                          Milestones &amp; Deliverable Sign-Off
                        </h3>
                        <p className="text-xs text-zinc-500">
                          Submit repository commits as the freelancer; approve deliverables as the client.
                        </p>
                      </div>

                      {(selected.status === 'ACTIVE' || selected.status === 'COMPLETED') && (
                        existingVc ? (
                          <button
                            type="button"
                            onClick={() => onNavigate('reputation')}
                            className="ui-btn-secondary"
                          >
                            View Issued Credential
                          </button>
                        ) : (
                          selected.clientDid === currentUser?.did && (
                            <button
                              type="button"
                              onClick={() => setIssueVcModal(true)}
                              className="ui-btn-primary"
                            >
                              Issue Verified Credential
                            </button>
                          )
                        )
                      )}
                    </div>

                    {selected.milestones?.length === 0 ? (
                      <div className="p-6 border border-dashed border-zinc-300 rounded-lg text-xs text-zinc-500 text-center">
                        Milestones activate once both parties co-sign this agreement onto the blockchain.
                      </div>
                    ) : (
                      <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-200">
                        {selected.milestones.map((ms) => (
                          <div key={ms.id} className="p-4 space-y-2.5 text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-zinc-900">{ms.title}</span>
                                  <span
                                    className={`ui-badge ${
                                      ms.status === 'VERIFIED_ONCHAIN'
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                        : ms.status === 'EVIDENCE_SUBMITTED'
                                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                                          : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                                    }`}
                                  >
                                    {ms.status === 'VERIFIED_ONCHAIN'
                                      ? 'Approved On-Chain'
                                      : ms.status === 'EVIDENCE_SUBMITTED'
                                        ? 'Submitted for Review'
                                        : 'Pending'}
                                  </span>
                                </div>
                                <div className="text-zinc-500 mt-0.5">
                                  {ms.deliverables} · Due {ms.dueDate}
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className="font-semibold tabular-nums text-zinc-900">
                                  {formatCurrency(ms.amount, selected.currency)}
                                </span>

                                {ms.status === 'PENDING' &&
                                  selected.status === 'ACTIVE' &&
                                  selected.freelancerDid === currentUser?.did && (
                                    <button
                                      type="button"
                                      onClick={() => setEvidenceModalMs(ms)}
                                      className="ui-btn-primary py-1 px-2.5 text-xs"
                                    >
                                      Submit Deliverable
                                    </button>
                                  )}

                                {ms.status === 'EVIDENCE_SUBMITTED' &&
                                  selected.status === 'ACTIVE' &&
                                  selected.clientDid === currentUser?.did && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => handleMilestoneSignOff(ms)}
                                      className="ui-btn-primary py-1 px-2.5 text-xs"
                                    >
                                      Approve &amp; Sign Off
                                    </button>
                                  )}
                              </div>
                            </div>

                            {ms.deliverableHash && (
                              <div className="p-3 rounded bg-zinc-50 border border-zinc-200 space-y-1">
                                <div className="font-mono text-[11px] text-zinc-600 flex flex-wrap gap-4">
                                  <span>Commit: {shortHex(ms.commitHash, 10, 6)}</span>
                                  <span>IPFS: {shortHex(ms.evidenceCid, 14, 6)}</span>
                                  {ms.blockNumber && <span>Block #{ms.blockNumber}</span>}
                                </div>
                                {ms.evidenceNotes && (
                                  <div className="text-zinc-700">{ms.evidenceNotes}</div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {subView === 'messages' && (
                  <div className="flex flex-col h-[420px] border border-zinc-200 rounded-lg overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50/40">
                      {workspaceMessages.length === 0 ? (
                        <div className="text-xs text-zinc-400 text-center pt-12">
                          Start a conversation with your counterparty. Messages sync live across browsers.
                        </div>
                      ) : (
                        workspaceMessages.map((m) => (
                          <div
                            key={m.id}
                            className={`p-3 rounded-lg text-xs border ${
                              m.messageType === 'SYSTEM'
                                ? 'bg-zinc-100 border-zinc-200 text-zinc-700'
                                : m.senderDid === currentUser?.did
                                  ? 'bg-zinc-900 border-zinc-900 text-white ml-12'
                                  : 'bg-white border-zinc-200 text-zinc-900 mr-12'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] opacity-70 mb-1">
                              <span className="font-medium">
                                {m.messageType === 'SYSTEM' ? 'System Log' : m.senderName}
                              </span>
                              <span>
                                {new Date(m.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <div>{m.body}</div>
                          </div>
                        ))
                      )}
                    </div>

                    <form
                      onSubmit={handleSendChat}
                      className="p-3 bg-white border-t border-zinc-200 flex gap-2"
                    >
                      <input
                        type="text"
                        placeholder="Write a message..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        className="ui-input"
                      />
                      <button type="submit" className="ui-btn-primary flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5" />
                        <span>Send</span>
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {(createOpen || amendTarget) && (
        <DigitalAgreementModal
          mode={amendTarget ? 'amend' : 'create'}
          parentAgreement={amendTarget}
          prefillFreelancer={directHirePrefill}
          identities={identities}
          currentUser={currentUser}
          onClose={() => {
            setCreateOpen(false);
            setAmendTarget(null);
            clearDirectHirePrefill?.();
          }}
          onSuccess={async (newId, msg) => {
            setCreateOpen(false);
            setAmendTarget(null);
            clearDirectHirePrefill?.();
            await onRefresh();
            if (newId) setSelectedAgreementId(newId);
            showToast(msg);
          }}
          showToast={showToast}
        />
      )}

      {evidenceModalMs && (
        <DeliverableModal
          milestone={evidenceModalMs}
          onClose={() => setEvidenceModalMs(null)}
          onSubmitted={async () => {
            setEvidenceModalMs(null);
            await onRefresh();
            showToast('Deliverable submitted for client sign-off.');
          }}
          showToast={showToast}
        />
      )}

      {issueVcModal && selected && (
        <IssueVcModal
          agreement={selected}
          onClose={() => setIssueVcModal(false)}
          onIssued={async () => {
            setIssueVcModal(false);
            await onRefresh();
            showToast('W3C Verifiable Credential anchored on-chain.');
            onNavigate('reputation');
          }}
          showToast={showToast}
        />
      )}

      {cryptoPrompt && (
        <CryptoSignModal
          title={cryptoPrompt.title}
          subtitle={cryptoPrompt.subtitle}
          termsHash={cryptoPrompt.termsHash}
          signingDigest={cryptoPrompt.signingDigest}
          signerUser={currentUser}
          onCancel={() => setCryptoPrompt(null)}
          onSigned={cryptoPrompt.onSigned}
        />
      )}

      {tamperModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-zinc-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  Test Unilateral Modification Lock
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Attempt to alter cost, deadline, or scope without the counterparty&apos;s signature.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTamperModal(null)}
                className="ui-btn-secondary py-1 px-2.5 text-xs"
              >
                Close
              </button>
            </div>

            <form onSubmit={runTamperTest} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Altered Cost</label>
                  <input
                    type="number"
                    value={tamperModal.tamperedCost}
                    onChange={(e) =>
                      setTamperModal({ ...tamperModal, tamperedCost: e.target.value })
                    }
                    className="ui-input tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Altered Deadline</label>
                  <input
                    type="date"
                    value={tamperModal.tamperedDeadline}
                    onChange={(e) =>
                      setTamperModal({ ...tamperModal, tamperedDeadline: e.target.value })
                    }
                    className="ui-input font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Altered Feature</label>
                <input
                  type="text"
                  value={tamperModal.tamperedFeatureTitle}
                  onChange={(e) =>
                    setTamperModal({ ...tamperModal, tamperedFeatureTitle: e.target.value })
                  }
                  className="ui-input"
                />
              </div>
              <button type="submit" disabled={busy} className="ui-btn-primary w-full py-2">
                {busy ? 'Checking Smart Contract...' : 'Attempt Unilateral Update'}
              </button>
            </form>

            {tamperResult && (
              <div className="p-4 rounded-lg bg-zinc-950 text-zinc-200 font-mono text-xs space-y-1.5">
                <div className="text-red-400 font-sans font-semibold">
                  Rejected by Smart Contract
                </div>
                <div className="break-all text-zinc-400">
                  Anchored: <span className="text-emerald-400">{tamperResult.originalTermsHash}</span>
                </div>
                <div className="break-all text-zinc-400">
                  Tampered: <span className="text-red-400">{tamperResult.tamperedTermsHash}</span>
                </div>
                <div className="text-amber-300">{tamperResult.evmContractResponse}</div>
                <p className="font-sans text-zinc-400 pt-2 border-t border-zinc-800">
                  {tamperResult.explanation}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DigitalAgreementModal({
  mode,
  parentAgreement,
  prefillFreelancer,
  identities,
  currentUser,
  onClose,
  onSuccess,
  showToast,
}) {
  const isAmend = mode === 'amend' && parentAgreement;
  const counterparties = identities.filter((u) => u.did !== currentUser?.did);

  const [myRole, setMyRole] = useState('CLIENT');
  const [counterpartyDid, setCounterpartyDid] = useState(
    prefillFreelancer?.did || counterparties[0]?.did || ''
  );
  const [title, setTitle] = useState(isAmend ? parentAgreement.title : '');
  const [summary, setSummary] = useState(isAmend ? parentAgreement.summary : '');
  const [category, setCategory] = useState(
    isAmend ? parentAgreement.category : 'Software Development'
  );
  const [startDate, setStartDate] = useState(
    isAmend ? parentAgreement.startDate : new Date().toISOString().slice(0, 10)
  );
  const [deadline, setDeadline] = useState(
    isAmend
      ? parentAgreement.deadline
      : new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10)
  );
  const [durationDays, setDurationDays] = useState(isAmend ? parentAgreement.durationDays : 21);
  const [totalCost, setTotalCost] = useState(isAmend ? parentAgreement.totalCost : 100000);
  const [currency, setCurrency] = useState(isAmend ? parentAgreement.currency : 'INR');
  const [amendmentReason, setAmendmentReason] = useState('');

  const [features, setFeatures] = useState(
    isAmend
      ? parentAgreement.features
      : [{ name: '', description: '', acceptanceCriteria: 'Meets agreed specification' }]
  );

  const [milestones, setMilestones] = useState(
    isAmend
      ? parentAgreement.milestonesSpec
      : [
          {
            title: 'Milestone 1: Delivery',
            deliverables: 'Source code and verification',
            dueDate: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
            amount: 100000,
          },
        ]
  );

  const [busy, setBusy] = useState(false);
  const [preparedSign, setPreparedSign] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const clientDid = isAmend
        ? parentAgreement.clientDid
        : myRole === 'CLIENT'
          ? currentUser.did
          : counterpartyDid;
      const freelancerDid = isAmend
        ? parentAgreement.freelancerDid
        : myRole === 'CLIENT'
          ? counterpartyDid
          : currentUser.did;
      const nonceSeed = Math.random().toString(36).slice(2, 10);

      const prep = await apiFetch('/api/agreements/prepare', {
        method: 'POST',
        body: JSON.stringify({
          parentAgreementId: isAmend ? parentAgreement.id : null,
          title,
          summary,
          category,
          clientDid,
          freelancerDid,
          startDate,
          deadline,
          durationDays: Number(durationDays),
          totalCost: Number(totalCost),
          currency,
          paymentSchedule: 'Milestone-Based',
          features,
          milestones,
          amendmentReason,
          nonceSeed,
        }),
      });

      setPreparedSign({ prep, clientDid, freelancerDid, nonceSeed });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white border border-zinc-200 rounded-lg shadow-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between border-b border-zinc-200 pb-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">
              {isAmend
                ? `Modify Agreement (v${parentAgreement.version} → v${parentAgreement.version + 1})`
                : 'New Digital Agreement'}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isAmend
                ? 'Current version stays active until the counterparty co-signs this modification.'
                : 'Both parties must sign before the agreement is anchored on-chain.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="ui-btn-secondary py-1 px-2.5 text-xs">
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {!isAmend && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Your role</label>
                <select
                  value={myRole}
                  onChange={(e) => setMyRole(e.target.value)}
                  className="ui-input"
                >
                  <option value="CLIENT">Gig Provider (Hiring)</option>
                  <option value="FREELANCER">Freelancer (Delivering)</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Counterparty</label>
                <select
                  value={counterpartyDid}
                  onChange={(e) => setCounterpartyDid(e.target.value)}
                  className="ui-input"
                >
                  {counterparties.map((u) => (
                    <option key={u.did} value={u.did}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {isAmend && (
            <div>
              <label className="block font-medium text-zinc-700 mb-1">
                Reason for modification
              </label>
              <input
                type="text"
                required
                placeholder="Summarize changes to timeline, cost, or features..."
                value={amendmentReason}
                onChange={(e) => setAmendmentReason(e.target.value)}
                className="ui-input"
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block font-medium text-zinc-700 mb-1">Agreement title</label>
              <input
                type="text"
                required
                placeholder="Project name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="ui-input"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="ui-input"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-zinc-700 mb-1">Scope summary</label>
            <textarea
              rows={2}
              required
              placeholder="Overview of deliverables and expectations..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="ui-input"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Start</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="ui-input font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Deadline</label>
              <input
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="ui-input font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Days</label>
              <input
                type="number"
                required
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                className="ui-input tabular-nums"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Total cost</label>
              <input
                type="number"
                required
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                className="ui-input tabular-nums"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="ui-input"
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="ETH">ETH</option>
              </select>
            </div>
          </div>

          <div className="border border-zinc-200 rounded-lg p-3.5 bg-zinc-50/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-800">Features</span>
              <button
                type="button"
                onClick={() =>
                  setFeatures([
                    ...features,
                    { name: '', description: '', acceptanceCriteria: 'Meets specification' },
                  ])
                }
                className="text-zinc-900 underline cursor-pointer"
              >
                + Add feature
              </button>
            </div>
            {features.map((f, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Feature"
                  value={f.name}
                  onChange={(e) => {
                    const next = [...features];
                    next[idx] = { ...next[idx], name: e.target.value };
                    setFeatures(next);
                  }}
                  className="ui-input"
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={f.description}
                  onChange={(e) => {
                    const next = [...features];
                    next[idx] = { ...next[idx], description: e.target.value };
                    setFeatures(next);
                  }}
                  className="ui-input"
                />
                <input
                  type="text"
                  placeholder="Acceptance criteria"
                  value={f.acceptanceCriteria}
                  onChange={(e) => {
                    const next = [...features];
                    next[idx] = { ...next[idx], acceptanceCriteria: e.target.value };
                    setFeatures(next);
                  }}
                  className="ui-input"
                />
              </div>
            ))}
          </div>

          <div className="border border-zinc-200 rounded-lg p-3.5 bg-zinc-50/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-800">Milestones</span>
              <button
                type="button"
                onClick={() =>
                  setMilestones([
                    ...milestones,
                    {
                      title: `Milestone ${milestones.length + 1}`,
                      deliverables: 'Deliverables',
                      dueDate: deadline,
                      amount: 25000,
                    },
                  ])
                }
                className="text-zinc-900 underline cursor-pointer"
              >
                + Add milestone
              </button>
            </div>
            {milestones.map((m, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-2">
                <input
                  type="text"
                  required
                  value={m.title}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[idx] = { ...next[idx], title: e.target.value };
                    setMilestones(next);
                  }}
                  className="ui-input"
                />
                <input
                  type="text"
                  required
                  value={m.deliverables}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[idx] = { ...next[idx], deliverables: e.target.value };
                    setMilestones(next);
                  }}
                  className="ui-input"
                />
                <input
                  type="date"
                  required
                  value={m.dueDate}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[idx] = { ...next[idx], dueDate: e.target.value };
                    setMilestones(next);
                  }}
                  className="ui-input font-mono"
                />
                <input
                  type="number"
                  required
                  value={m.amount}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[idx] = { ...next[idx], amount: Number(e.target.value) };
                    setMilestones(next);
                  }}
                  className="ui-input tabular-nums"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="ui-btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="ui-btn-primary">
              {busy
                ? 'Preparing Hash...'
                : isAmend
                  ? 'Hash & Sign Modification'
                  : 'Hash & Sign Agreement'}
            </button>
          </div>
        </form>

        {preparedSign && (
          <CryptoSignModal
            title={
              isAmend
                ? `Sign Modification Proposal v${parentAgreement.version + 1}`
                : 'Sign Digital Agreement v1'
            }
            subtitle="Sign the Keccak-256 payload hash with your Private Signing Key."
            termsHash={preparedSign.prep.termsHash}
            signingDigest={preparedSign.prep.signingDigest}
            signerUser={currentUser}
            onCancel={() => setPreparedSign(null)}
            onSigned={async (signatureHex) => {
              if (isAmend) {
                const res = await apiFetch(
                  `/api/agreements/${parentAgreement.id}/propose-amendment`,
                  {
                    method: 'POST',
                    body: JSON.stringify({
                      title,
                      summary,
                      category,
                      startDate,
                      deadline,
                      durationDays: Number(durationDays),
                      totalCost: Number(totalCost),
                      currency,
                      features,
                      milestones,
                      amendmentReason,
                      proposerSignature: signatureHex,
                      agreementIdOverride: preparedSign.prep.agreementId,
                      nonceSeed: preparedSign.nonceSeed,
                    }),
                  }
                );
                await onSuccess(
                  res.newAgreementId,
                  `Modification request v${res.version} signed with your Private Key and sent to counterparty.`
                );
              } else {
                const res = await apiFetch('/api/agreements', {
                  method: 'POST',
                  body: JSON.stringify({
                    title,
                    summary,
                    category,
                    clientDid: preparedSign.clientDid,
                    freelancerDid: preparedSign.freelancerDid,
                    startDate,
                    deadline,
                    durationDays: Number(durationDays),
                    totalCost: Number(totalCost),
                    currency,
                    features,
                    milestones,
                    proposerSignature: signatureHex,
                    agreementIdOverride: preparedSign.prep.agreementId,
                    nonceSeed: preparedSign.nonceSeed,
                  }),
                });
                await onSuccess(
                  res.agreementId,
                  'Digital Agreement v1 signed with your Private Key and sent to counterparty.'
                );
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function DeliverableModal({ milestone, onClose, onSubmitted, showToast }) {
  const [commitHash, setCommitHash] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/milestones/${milestone.id}/submit-evidence`, {
        method: 'POST',
        body: JSON.stringify({ commitHash, repoUrl, evidenceNotes }),
      });
      await onSubmitted();
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
          <h3 className="text-base font-semibold text-zinc-900">Submit Deliverable</h3>
          <button type="button" onClick={onClose} className="ui-btn-secondary py-1 px-2.5 text-xs">
            Cancel
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-zinc-700 mb-1">Git commit hash</label>
            <input
              type="text"
              required
              placeholder="e.g. a84f291c..."
              value={commitHash}
              onChange={(e) => setCommitHash(e.target.value)}
              className="ui-input font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-zinc-700 mb-1">Repository / preview URL</label>
            <input
              type="url"
              required
              placeholder="https://github.com/..."
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="ui-input"
            />
          </div>
          <div>
            <label className="block font-medium text-zinc-700 mb-1">Release notes</label>
            <textarea
              rows={3}
              required
              placeholder="Summary of completed deliverables..."
              value={evidenceNotes}
              onChange={(e) => setEvidenceNotes(e.target.value)}
              className="ui-input"
            />
          </div>
          <button type="submit" disabled={busy} className="ui-btn-primary w-full py-2">
            {busy ? 'Submitting...' : 'Sign & Submit'}
          </button>
        </form>
      </div>
    </div>
  );
}

function IssueVcModal({ agreement, onClose, onIssued, showToast }) {
  const [rolePerformed, setRolePerformed] = useState('Lead Contractor');
  const [summaryStatement, setSummaryStatement] = useState(
    `${agreement.freelancerName} completed ${agreement.title}.`
  );
  const [skillsText, setSkillsText] = useState('');
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
          rolePerformed,
          summaryStatement,
          skillsVerified: skillsText
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white border border-zinc-200 rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
          <h3 className="text-base font-semibold text-zinc-900">Issue Verified Credential</h3>
          <button type="button" onClick={onClose} className="ui-btn-secondary py-1 px-2.5 text-xs">
            Cancel
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-zinc-700 mb-1">Role performed</label>
            <input
              type="text"
              required
              value={rolePerformed}
              onChange={(e) => setRolePerformed(e.target.value)}
              className="ui-input"
            />
          </div>
          <div>
            <label className="block font-medium text-zinc-700 mb-1">Verification statement</label>
            <textarea
              rows={2}
              required
              value={summaryStatement}
              onChange={(e) => setSummaryStatement(e.target.value)}
              className="ui-input"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block font-medium text-zinc-700 mb-1">Skills verified</label>
              <input
                type="text"
                placeholder="TypeScript, Go"
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
                className="ui-input"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Rating</label>
              <select
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="ui-input"
              >
                <option value={5}>5 / 5</option>
                <option value={4}>4 / 5</option>
                <option value={3}>3 / 5</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={busy} className="ui-btn-primary w-full py-2">
            {busy ? 'Anchoring...' : 'Sign & Anchor Credential'}
          </button>
        </form>
      </div>
    </div>
  );
}
