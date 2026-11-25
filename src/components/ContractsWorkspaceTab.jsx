import React, { useMemo, useState } from 'react';
import {
  FileSignature,
  Plus,
  CheckCircle2,
  Clock,
  GitBranch,
  ArrowRight,
  Lock,
  ShieldAlert,
  Upload,
  Award,
  Send,
  MessageSquare,
  GitCommit,
  RefreshCw,
  SearchCheck,
  XCircle,
} from 'lucide-react';
import {
  agreementStatusMeta,
  apiFetch,
  formatCurrency,
  initials,
  shortHex,
  signDigestWithBrowserWallet,
  tierMeta,
} from '../lib/wallet.js';

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
  const [scopeFilter, setScopeFilter] = useState('MINE');
  const [createModalOpen, setCreateModalOpen] = useState(Boolean(directHirePrefill));
  const [amendTarget, setAmendTarget] = useState(null);
  const [tamperModal, setTamperModal] = useState(null);
  const [tamperResult, setTamperResult] = useState(null);
  const [evidenceModalMs, setEvidenceModalMs] = useState(null);
  const [issueVcModal, setIssueVcModal] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (directHirePrefill) setCreateModalOpen(true);
  }, [directHirePrefill]);

  const visibleAgreements = useMemo(() => {
    return agreements.filter((a) => {
      if (scopeFilter === 'MINE') {
        return a.clientDid === currentUser?.did || a.freelancerDid === currentUser?.did;
      }
      if (scopeFilter === 'PENDING') {
        return a.status === 'PENDING_SIGNATURES' || a.status === 'AMENDMENT_PENDING';
      }
      if (scopeFilter === 'ACTIVE') return a.status === 'ACTIVE';
      return true;
    });
  }, [agreements, scopeFilter, currentUser]);

  const selected = useMemo(() => {
    return (
      agreements.find((a) => a.id === selectedAgreementId) ||
      visibleAgreements[0] ||
      agreements[0] ||
      null
    );
  }, [agreements, visibleAgreements, selectedAgreementId]);

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
    if (!currentUser || currentUser.hasCustodialKey) return null;
    return signDigestWithBrowserWallet(currentUser.address, digestHex);
  }

  async function handleCoSignInitial(ag) {
    setBusy(true);
    try {
      const extSig = await maybeExternalSig(ag.signingDigest);
      const res = await apiFetch(`/api/agreements/${ag.id}/cosign`, {
        method: 'POST',
        body: JSON.stringify({ actorDid: currentUser.did, signature: extSig }),
      });
      await onRefresh();
      showToast(
        `Digital Agreement v1 co-signed & stored on blockchain at Block #${res.receipt.blockNumber}!`
      );
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleCoSignAmendment(proposal) {
    setBusy(true);
    try {
      const extSig = await maybeExternalSig(proposal.signingDigest);
      const res = await apiFetch(`/api/agreements/${proposal.id}/cosign-amendment`, {
        method: 'POST',
        body: JSON.stringify({ actorDid: currentUser.did, signature: extSig }),
      });
      setSelectedAgreementId(proposal.id);
      await onRefresh();
      showToast(
        `Both parties agreed! New Agreement v${proposal.version} anchored at Block #${res.receipt.blockNumber} (v${proposal.version - 1} marked Superseded).`
      );
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline(ag) {
    setBusy(true);
    try {
      await apiFetch(`/api/agreements/${ag.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({
          actorDid: currentUser.did,
          reason: `Declined by ${currentUser.name}`,
        }),
      });
      await onRefresh();
      showToast('Proposal declined. Existing active contract remains unchanged.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleMilestoneSignOff(ms) {
    if (!selected) return;
    if (currentUser?.did !== selected.clientDid) {
      showToast(
        `Switch account in the navbar to ${selected.clientName} (Gig Provider) to approve & sign off this deliverable.`,
        'error'
      );
      return;
    }
    setBusy(true);
    try {
      const extSig = await maybeExternalSig(ms.signingDigest);
      const res = await apiFetch(`/api/milestones/${ms.id}/sign-off`, {
        method: 'POST',
        body: JSON.stringify({ actorDid: currentUser.did, signature: extSig }),
      });
      await onRefresh();
      showToast(
        res.agreementCompleted
          ? `All milestones approved! Contract completed on-chain — you can now issue the Verified Work Credential.`
          : `Milestone #${ms.index} signed off & anchored at Block #${res.receipt.blockNumber}!`
      );
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendChat(e) {
    e.preventDefault();
    if (!chatInput.trim() || !selected) return;
    try {
      await apiFetch('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          threadId: selected.rootAgreementId,
          senderDid: currentUser.did,
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
          attackerDid: tamperModal.attackerDid,
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

  const isParty =
    selected &&
    currentUser &&
    (selected.clientDid === currentUser.did || selected.freelancerDid === currentUser.did);

  const needsMyInitialSig =
    selected?.status === 'PENDING_SIGNATURES' &&
    currentUser &&
    ((selected.clientDid === currentUser.did && !selected.clientSignature) ||
      (selected.freelancerDid === currentUser.did && !selected.freelancerSignature));

  const needsMyAmendmentSig =
    selected?.status === 'AMENDMENT_PENDING' &&
    currentUser &&
    ((selected.clientDid === currentUser.did && !selected.clientSignature) ||
      (selected.freelancerDid === currentUser.did && !selected.freelancerSignature));

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="tw-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Digital Agreements &amp; Project Workspaces
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Every contract locks agreed <strong>time</strong>, <strong>cost</strong>, and{' '}
            <strong>features</strong> on the blockchain once both parties sign. Modifying any term requires mutual signatures, creating a new linked agreement version.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="tw-btn-primary px-4 py-2.5 text-xs sm:text-sm flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Digital Agreement</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'MINE', label: 'My Contracts' },
          { id: 'ALL', label: `All Platform Contracts (${agreements.length})` },
          {
            id: 'PENDING',
            label: `Awaiting Signature (${
              agreements.filter(
                (a) => a.status === 'PENDING_SIGNATURES' || a.status === 'AMENDMENT_PENDING'
              ).length
            })`,
          },
          {
            id: 'ACTIVE',
            label: `Active On-Chain (${agreements.filter((a) => a.status === 'ACTIVE').length})`,
          },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setScopeFilter(f.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              scopeFilter === f.id
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Master-Detail Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Agreement List */}
        <div className="lg:col-span-4 space-y-3">
          {visibleAgreements.length === 0 ? (
            <div className="tw-card p-6 text-xs text-slate-500">
              No contracts in this view yet. Switch to &ldquo;All Platform Contracts&rdquo; or create a new Digital Agreement!
            </div>
          ) : (
            visibleAgreements.map((ag) => {
              const sMeta = agreementStatusMeta(ag.status);
              const isSelected = selected?.id === ag.id;
              const waitingOnMe =
                (ag.status === 'PENDING_SIGNATURES' || ag.status === 'AMENDMENT_PENDING') &&
                ((ag.clientDid === currentUser?.did && !ag.clientSignature) ||
                  (ag.freelancerDid === currentUser?.did && !ag.freelancerSignature));

              return (
                <div
                  key={ag.id}
                  onClick={() => setSelectedAgreementId(ag.id)}
                  className={`rounded-xl p-4 border cursor-pointer transition ${
                    isSelected
                      ? 'bg-indigo-50/60 border-indigo-500 ring-2 ring-indigo-500/15'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${sMeta.cls}`}>
                      {sMeta.label} · v{ag.version}
                    </span>
                    <span className="font-mono font-bold text-xs text-slate-900">
                      {formatCurrency(ag.totalCost, ag.currency)}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 mt-2 leading-snug">
                    {ag.title}
                  </h3>
                  <div className="text-xs text-slate-500 mt-1">
                    {ag.clientName.split('(')[0].trim()} ↔ {ag.freelancerName}
                  </div>
                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                    <span>Deadline: {ag.deadline}</span>
                    {waitingOnMe ? (
                      <span className="text-rose-600 font-semibold">● Your Signature Needed</span>
                    ) : ag.blockNumber ? (
                      <span className="text-emerald-600 font-mono font-medium">
                        Block #{ag.blockNumber}
                      </span>
                    ) : (
                      <span>Pending</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Contract Detail + Milestones + Live Chat */}
        {selected && (
          <div className="lg:col-span-8 space-y-5">
            {/* Version History Chain */}
            <div className="tw-card p-3.5 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mr-1">
                <GitBranch className="w-4 h-4 text-indigo-600" />
                Agreement History:
              </span>
              {lineage.map((ver, idx) => (
                <React.Fragment key={ver.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedAgreementId(ver.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      ver.id === selected.id
                        ? 'bg-slate-900 text-white'
                        : ver.status === 'AMENDMENT_PENDING'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    v{ver.version} · {agreementStatusMeta(ver.status).label} (
                    {formatCurrency(ver.totalCost, ver.currency)})
                  </button>
                  {idx < lineage.length - 1 && (
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Alert if a Pending Change Request Exists on This Active Contract */}
            {selected.status === 'ACTIVE' && pendingChildAmendment && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-rose-700 uppercase">
                    Pending Modification Request (v{pendingChildAmendment.version})
                  </span>
                  <p className="text-xs text-rose-900 mt-0.5">
                    A change to time/cost/features has been proposed. Agreement v{selected.version} stays active and protected on-chain until both parties sign v{pendingChildAmendment.version}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAgreementId(pendingChildAmendment.id)}
                  className="tw-btn-primary px-3.5 py-2 text-xs shrink-0"
                >
                  Review Modification Diff (v{pendingChildAmendment.version})
                </button>
              </div>
            )}

            {/* Co-Sign Banner for Initial Pending v1 */}
            {selected.status === 'PENDING_SIGNATURES' && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-amber-800 uppercase">
                    Dual-Party Agreement Approval · Version 1
                  </span>
                  <p className="text-xs text-amber-900 mt-0.5">
                    {needsMyInitialSig
                      ? `${currentUser.name}, review the agreed timeline, cost, and features below and click Sign to store this agreement on the blockchain.`
                      : `Signed by proposer. Waiting for ${
                          !selected.clientSignature ? selected.clientName : selected.freelancerName
                        } to co-sign (switch account in top-right to test co-signing!).`}
                  </p>
                </div>
                {needsMyInitialSig && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleCoSignInitial(selected)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-xl text-xs cursor-pointer"
                    >
                      {busy ? 'Storing On-Chain...' : '✓ Agree & Sign On Blockchain'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDecline(selected)}
                      className="tw-btn-secondary px-3 py-2 text-xs text-red-600"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Mutual Modification Diff & Co-Sign Card (v2+) */}
            {parentAgreement && (
              <div className="tw-card p-5 border-l-4 border-l-indigo-600 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-indigo-600 uppercase">
                      Mutual Modification Comparison · v{parentAgreement.version} ➔ v{selected.version}
                    </span>
                    <p className="text-xs text-slate-600 mt-0.5">
                      <strong>Change Summary:</strong> {selected.amendmentReason}
                    </p>
                  </div>

                  {selected.status === 'AMENDMENT_PENDING' &&
                    (needsMyAmendmentSig ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleCoSignAmendment(selected)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-xl text-xs cursor-pointer"
                        >
                          {busy
                            ? 'Minting New Agreement...'
                            : `✓ Approve & Mint Agreement v${selected.version}`}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDecline(selected)}
                          className="tw-btn-secondary px-3 py-2 text-xs text-red-600"
                        >
                          Decline Change
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-lg font-medium">
                        Waiting for{' '}
                        {!selected.clientSignature ? selected.clientName : selected.freelancerName}{' '}
                        to co-sign
                      </span>
                    ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-slate-400 font-semibold">AGREED COST</div>
                    <div className="mt-1 font-mono">
                      <span className="line-through text-rose-500 mr-1.5">
                        {formatCurrency(parentAgreement.totalCost, parentAgreement.currency)}
                      </span>
                      <span className="font-bold text-emerald-700">
                        ➔ {formatCurrency(selected.totalCost, selected.currency)}
                      </span>
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-slate-400 font-semibold">DEADLINE</div>
                    <div className="mt-1 font-mono">
                      <span className="line-through text-rose-500 mr-1.5">
                        {parentAgreement.deadline}
                      </span>
                      <span className="font-bold text-indigo-700">➔ {selected.deadline}</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-slate-400 font-semibold">SCOPE ITEMS</div>
                    <div className="mt-1 font-semibold text-slate-800">
                      {parentAgreement.features.length} ➔ {selected.features.length} Features ·{' '}
                      {parentAgreement.milestonesSpec.length} ➔ {selected.milestonesSpec.length}{' '}
                      Milestones
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Main Digital Agreement Specification */}
            <div className="tw-card p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                        agreementStatusMeta(selected.status).cls
                      }`}
                    >
                      {agreementStatusMeta(selected.status).label} · Version {selected.version}
                    </span>
                    <span className="text-xs text-slate-500">{selected.category}</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-1.5">{selected.title}</h2>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">{selected.summary}</p>
                </div>

                {/* Contract Actions */}
                <div className="flex flex-wrap gap-2 shrink-0">
                  {selected.status === 'ACTIVE' && !pendingChildAmendment && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!isParty) {
                          showToast(
                            `Switch account to ${selected.clientName} or ${selected.freelancerName} to propose a contract modification.`,
                            'error'
                          );
                          return;
                        }
                        setAmendTarget(selected);
                      }}
                      className="tw-btn-primary px-3.5 py-2 text-xs flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Modify Agreement (Mutual Consent)</span>
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
                            attackerDid: selected.clientDid,
                            tamperedCost: Math.round(selected.totalCost * 0.5),
                            tamperedDeadline: selected.deadline,
                            tamperedFeatureTitle:
                              (selected.features[0]?.name || 'Feature') + ' + Extra Unagreed Work',
                          });
                        }}
                        className="tw-btn-secondary px-3 py-2 text-xs text-rose-700 border-rose-200 hover:bg-rose-50 flex items-center gap-1.5"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Test Tamper Lock</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onOpenAudit('agreement', selected.id, selected.canonicalPayload)
                        }
                        className="tw-btn-secondary px-3 py-2 text-xs flex items-center gap-1.5"
                      >
                        <SearchCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Verify On-Chain</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Dual Signers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                    <span>GIG PROVIDER (CLIENT)</span>
                    <span className={`px-2 py-0.2 rounded-full border ${tierMeta(selected.clientTier).badge}`}>
                      {tierMeta(selected.clientTier).label}
                    </span>
                  </div>
                  <div className="font-bold text-sm text-slate-900 mt-1">{selected.clientName}</div>
                  <div className="font-mono text-[11px] text-slate-400 truncate">
                    {selected.clientDid}
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200 text-xs">
                    {selected.clientSignature ? (
                      <span className="text-emerald-700 font-medium flex items-center gap-1 font-mono text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Signed ({shortHex(selected.clientSignature, 10, 6)})
                      </span>
                    ) : (
                      <span className="text-amber-700 font-medium flex items-center gap-1 text-[11px]">
                        <Clock className="w-3.5 h-3.5" />
                        Awaiting Signature
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                    <span>FREELANCER</span>
                    <span className="px-2 py-0.2 rounded-full bg-white border border-slate-200 text-slate-600">
                      Self-Controlled DID
                    </span>
                  </div>
                  <div className="font-bold text-sm text-slate-900 mt-1">
                    {selected.freelancerName}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400 truncate">
                    {selected.freelancerDid}
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200 text-xs">
                    {selected.freelancerSignature ? (
                      <span className="text-emerald-700 font-medium flex items-center gap-1 font-mono text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Signed ({shortHex(selected.freelancerSignature, 10, 6)})
                      </span>
                    ) : (
                      <span className="text-amber-700 font-medium flex items-center gap-1 text-[11px]">
                        <Clock className="w-3.5 h-3.5" />
                        Awaiting Signature
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Agreed Time & Cost */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3">
                  <div className="text-[11px] font-semibold text-indigo-600">AGREED PRICE</div>
                  <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                    {formatCurrency(selected.totalCost, selected.currency)}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[11px] font-semibold text-slate-400">START DATE</div>
                  <div className="text-sm font-bold text-slate-800 mt-1 font-mono">
                    {selected.startDate}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[11px] font-semibold text-slate-400">DEADLINE</div>
                  <div className="text-sm font-bold text-slate-800 mt-1 font-mono">
                    {selected.deadline}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[11px] font-semibold text-slate-400">TIMELINE</div>
                  <div className="text-xs font-bold text-slate-800 mt-1">
                    {selected.durationDays} Days · {selected.paymentSchedule}
                  </div>
                </div>
              </div>

              {/* Agreed Features */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Agreed Features &amp; Acceptance Criteria ({selected.features.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {selected.features.map((f, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1"
                    >
                      <div className="font-bold text-slate-900">
                        {idx + 1}. {f.name}
                      </div>
                      {f.description && <p className="text-slate-600">{f.description}</p>}
                      <div className="text-[11px] text-indigo-700 font-medium">
                        Acceptance: {f.acceptanceCriteria}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Blockchain Proof Strip */}
              <div className="rounded-xl bg-slate-900 text-slate-200 p-3.5 text-xs font-mono space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-400 font-sans font-semibold text-xs mb-1">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Blockchain Fingerprint (Keccak-256 + IPFS Content CID)</span>
                </div>
                <div className="truncate">
                  <span className="text-slate-400">Terms Hash: </span>
                  <span className="text-emerald-300">{selected.termsHash}</span>
                </div>
                <div className="truncate">
                  <span className="text-slate-400">IPFS CID: </span>
                  <span className="text-sky-300">{selected.ipfsCid}</span>
                </div>
                {selected.txHash && (
                  <div className="truncate">
                    <span className="text-slate-400">
                      On-Chain Tx (Block #{selected.blockNumber}):{' '}
                    </span>
                    <span className="text-amber-300">{selected.txHash}</span>
                  </div>
                )}
              </div>
            </div>

            {/* MILESTONE DELIVERABLES & CREDENTIAL ISSUANCE */}
            {(selected.status === 'ACTIVE' || selected.status === 'COMPLETED') && (
              <div className="tw-card p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-base text-slate-900">
                      Milestones, Deliverable Proofs &amp; Sign-Off
                    </h3>
                    <p className="text-xs text-slate-500">
                      Freelancer submits Git commit hashes &amp; deliverables; Gig Provider approves &amp; anchors completion on-chain.
                    </p>
                  </div>

                  {existingVc ? (
                    <button
                      type="button"
                      onClick={() => onNavigate('reputation')}
                      className="tw-btn-secondary px-3.5 py-2 text-xs text-emerald-700 border-emerald-200 bg-emerald-50 flex items-center gap-1.5"
                    >
                      <Award className="w-4 h-4" />
                      <span>Verified Work Credential Issued ➔</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (currentUser?.did !== selected.clientDid) {
                          showToast(
                            `Switch account to ${selected.clientName} (Gig Provider) to issue the Verified Work Credential.`,
                            'error'
                          );
                          return;
                        }
                        setIssueVcModal(true);
                      }}
                      className="tw-btn-primary px-3.5 py-2 text-xs flex items-center gap-1.5"
                    >
                      <Award className="w-4 h-4" />
                      <span>Issue Verified Work Credential</span>
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {selected.milestones.map((ms) => (
                    <div
                      key={ms.id}
                      className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{ms.title}</span>
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                ms.status === 'VERIFIED_ONCHAIN'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : ms.status === 'EVIDENCE_SUBMITTED'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {ms.status === 'VERIFIED_ONCHAIN'
                                ? '✓ Approved On-Chain'
                                : ms.status === 'EVIDENCE_SUBMITTED'
                                  ? 'Deliverable Submitted'
                                  : 'In Progress'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {ms.deliverables} · Due {ms.dueDate}
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-bold text-sm text-slate-900">
                            {formatCurrency(ms.amount, selected.currency)}
                          </span>

                          {ms.status === 'PENDING' && selected.status === 'ACTIVE' && (
                            <button
                              type="button"
                              onClick={() => {
                                if (currentUser?.did !== selected.freelancerDid) {
                                  showToast(
                                    `Switch account to ${selected.freelancerName} (Freelancer) to submit deliverables.`,
                                    'error'
                                  );
                                  return;
                                }
                                setEvidenceModalMs(ms);
                              }}
                              className="tw-btn-primary px-3 py-1.5 text-xs flex items-center gap-1"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>Submit Work</span>
                            </button>
                          )}

                          {ms.status === 'EVIDENCE_SUBMITTED' && selected.status === 'ACTIVE' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleMilestoneSignOff(ms)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                            >
                              ✓ Approve &amp; Sign Off
                            </button>
                          )}
                        </div>
                      </div>

                      {ms.deliverableHash && (
                        <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-slate-600">
                            <span className="flex items-center gap-1 font-semibold text-indigo-700">
                              <GitCommit className="w-3.5 h-3.5" />
                              Commit: {shortHex(ms.commitHash, 10, 6)}
                            </span>
                            <span>IPFS CID: {shortHex(ms.evidenceCid, 14, 6)}</span>
                            {ms.blockNumber && (
                              <span className="text-emerald-700">
                                Verified Block #{ms.blockNumber}
                              </span>
                            )}
                          </div>
                          {ms.evidenceNotes && (
                            <p className="text-slate-600">{ms.evidenceNotes}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* WORKSPACE DISCUSSION & ACTIVITY THREAD */}
            <div className="tw-card p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <span>Contract Workspace Chat &amp; Audit Log</span>
              </div>

              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {workspaceMessages.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No messages yet. Discuss scope details, deliverables, or contract changes here.
                  </p>
                ) : (
                  workspaceMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`p-3 rounded-xl text-xs ${
                        m.messageType === 'SYSTEM'
                          ? 'bg-indigo-50/70 border border-indigo-100 text-indigo-900'
                          : 'bg-slate-50 border border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
                        <span className="font-bold text-slate-800">
                          {m.messageType === 'SYSTEM' ? '⚡ Blockchain Event' : m.senderName}
                        </span>
                        <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p>{m.body}</p>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendChat} className="flex gap-2 pt-1">
                <input
                  type="text"
                  placeholder={`Message as ${currentUser?.name}...`}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="tw-input text-xs"
                />
                <button
                  type="submit"
                  className="tw-btn-primary px-4 py-2 text-xs flex items-center gap-1 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Create OR Modify Digital Agreement Modal */}
      {(createModalOpen || amendTarget) && (
        <DigitalAgreementModal
          mode={amendTarget ? 'amend' : 'create'}
          parentAgreement={amendTarget}
          prefillFreelancer={directHirePrefill}
          identities={identities}
          currentUser={currentUser}
          onClose={() => {
            setCreateModalOpen(false);
            setAmendTarget(null);
            clearDirectHirePrefill?.();
          }}
          onSuccess={async (newId, msg) => {
            setCreateModalOpen(false);
            setAmendTarget(null);
            clearDirectHirePrefill?.();
            await onRefresh();
            if (newId) setSelectedAgreementId(newId);
            showToast(msg);
          }}
          showToast={showToast}
        />
      )}

      {/* Submit Deliverable Modal */}
      {evidenceModalMs && selected && (
        <DeliverableModal
          milestone={evidenceModalMs}
          currentUser={currentUser}
          onClose={() => setEvidenceModalMs(null)}
          onSubmitted={async () => {
            setEvidenceModalMs(null);
            await onRefresh();
            showToast(
              `Deliverable proof pinned to IPFS & signed! Waiting for ${selected.clientName} to approve.`
            );
          }}
          showToast={showToast}
        />
      )}

      {/* Issue Credential Modal */}
      {issueVcModal && selected && (
        <IssueVcModal
          agreement={selected}
          currentUser={currentUser}
          onClose={() => setIssueVcModal(false)}
          onIssued={async () => {
            setIssueVcModal(false);
            await onRefresh();
            showToast('Verified Work Credential anchored on blockchain!');
            onNavigate('reputation');
          }}
          showToast={showToast}
        />
      )}

      {/* Unilateral Tamper Protection Simulator Modal */}
      {tamperModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="tw-card max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-xs font-bold text-rose-600 uppercase">
                  Blockchain Tamper Protection Test
                </span>
                <h3 className="font-bold text-lg text-slate-900 mt-0.5">
                  Try Modifying Time, Cost, or Features as One Party Alone
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  See what happens if either the Gig Provider or Freelancer tries to alter the agreement without the other party&apos;s cryptographic signature.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTamperModal(null)}
                className="tw-btn-secondary px-3 py-1 text-xs"
              >
                Close
              </button>
            </div>

            <form onSubmit={runTamperTest} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Single Party Acting Alone</label>
                  <select
                    value={tamperModal.attackerDid}
                    onChange={(e) =>
                      setTamperModal({ ...tamperModal, attackerDid: e.target.value })
                    }
                    className="tw-input text-xs"
                  >
                    <option value={tamperModal.agreement.clientDid}>
                      Gig Provider ({tamperModal.agreement.clientName.split('(')[0]})
                    </option>
                    <option value={tamperModal.agreement.freelancerDid}>
                      Freelancer ({tamperModal.agreement.freelancerName})
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Altered Price</label>
                  <input
                    type="number"
                    value={tamperModal.tamperedCost}
                    onChange={(e) =>
                      setTamperModal({ ...tamperModal, tamperedCost: e.target.value })
                    }
                    className="tw-input text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Altered Deadline</label>
                  <input
                    type="date"
                    value={tamperModal.tamperedDeadline}
                    onChange={(e) =>
                      setTamperModal({ ...tamperModal, tamperedDeadline: e.target.value })
                    }
                    className="tw-input text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Altered Feature Scope</label>
                <input
                  type="text"
                  value={tamperModal.tamperedFeatureTitle}
                  onChange={(e) =>
                    setTamperModal({ ...tamperModal, tamperedFeatureTitle: e.target.value })
                  }
                  className="tw-input text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs cursor-pointer"
              >
                {busy ? 'Testing Smart Contract...' : 'Attempt Unilateral Modification'}
              </button>
            </form>

            {tamperResult && (
              <div className="rounded-xl bg-slate-900 text-slate-100 p-4 text-xs space-y-2 font-mono">
                <div className="flex items-center gap-2 text-rose-400 font-sans font-bold text-sm">
                  <XCircle className="w-5 h-5 shrink-0" />
                  <span>Unilateral Modification Blocked by Smart Contract!</span>
                </div>
                <div className="break-all">
                  <span className="text-slate-400">On-Chain Hash: </span>
                  <span className="text-emerald-400">{tamperResult.originalTermsHash}</span>
                </div>
                <div className="break-all">
                  <span className="text-slate-400">Tampered Hash: </span>
                  <span className="text-rose-400">{tamperResult.tamperedTermsHash}</span>
                </div>
                <div>
                  <span className="text-slate-400">Blockchain Response: </span>
                  <span className="text-amber-300 font-semibold">
                    {tamperResult.evmContractResponse}
                  </span>
                </div>
                <p className="font-sans text-slate-300 pt-2 border-t border-slate-700">
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

  const initialClientDid = isAmend ? parentAgreement.clientDid : currentUser?.did;
  const initialFreelancerDid = isAmend
    ? parentAgreement.freelancerDid
    : prefillFreelancer?.did ||
      identities.find((i) => i.did !== initialClientDid)?.did ||
      identities[0]?.did;

  const [clientDid, setClientDid] = useState(initialClientDid);
  const [freelancerDid, setFreelancerDid] = useState(initialFreelancerDid);
  const [title, setTitle] = useState(
    isAmend ? parentAgreement.title : 'Full-Stack Customer Portal & Analytics API'
  );
  const [summary, setSummary] = useState(
    isAmend
      ? parentAgreement.summary
      : 'Design, build, and deploy a responsive customer portal with role-based permissions and real-time billing webhooks.'
  );
  const [category, setCategory] = useState(
    isAmend ? parentAgreement.category : 'Full-Stack Development'
  );
  const [startDate, setStartDate] = useState(
    isAmend ? parentAgreement.startDate : new Date().toISOString().slice(0, 10)
  );
  const [deadline, setDeadline] = useState(isAmend ? parentAgreement.deadline : '2026-12-28');
  const [durationDays, setDurationDays] = useState(isAmend ? parentAgreement.durationDays : 30);
  const [totalCost, setTotalCost] = useState(isAmend ? parentAgreement.totalCost : 360000);
  const [currency, setCurrency] = useState(isAmend ? parentAgreement.currency : 'INR');
  const [paymentSchedule, setPaymentSchedule] = useState(
    isAmend ? parentAgreement.paymentSchedule : 'Milestone-Based'
  );
  const [amendmentReason, setAmendmentReason] = useState('');

  const [features, setFeatures] = useState(
    isAmend
      ? parentAgreement.features
      : [
          {
            name: 'Authentication & Role-Based Dashboard',
            description: 'SSO + granular team permissions',
            acceptanceCriteria: 'Passes E2E auth test suite',
          },
          {
            name: 'Billing & Webhook Integration',
            description: 'Automated invoice & usage tracking',
            acceptanceCriteria: 'Zero failed webhook retries',
          },
        ]
  );

  const [milestones, setMilestones] = useState(
    isAmend
      ? parentAgreement.milestonesSpec
      : [
          {
            title: 'Milestone 1: Auth & Core Portal UI',
            deliverables: 'Frontend + API endpoints',
            dueDate: '2026-12-14',
            amount: 180000,
          },
          {
            title: 'Milestone 2: Billing Engine & Production Launch',
            deliverables: 'Deployed production app + tests',
            dueDate: '2026-12-28',
            amount: 180000,
          },
        ]
  );

  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const proposerDid =
        currentUser?.did === clientDid || currentUser?.did === freelancerDid
          ? currentUser.did
          : clientDid;

      if (isAmend) {
        const res = await apiFetch(`/api/agreements/${parentAgreement.id}/propose-amendment`, {
          method: 'POST',
          body: JSON.stringify({
            proposedByDid: proposerDid,
            title,
            summary,
            category,
            startDate,
            deadline,
            durationDays: Number(durationDays),
            totalCost: Number(totalCost),
            currency,
            paymentSchedule,
            features,
            milestones,
            amendmentReason,
          }),
        });
        await onSuccess(
          res.newAgreementId,
          `Modification Proposal (v${res.version}) signed! Both parties must agree — switch to the other party to approve & mint the new agreement on-chain.`
        );
      } else {
        const res = await apiFetch('/api/agreements', {
          method: 'POST',
          body: JSON.stringify({
            title,
            summary,
            category,
            clientDid,
            freelancerDid,
            proposedByDid: proposerDid,
            startDate,
            deadline,
            durationDays: Number(durationDays),
            totalCost: Number(totalCost),
            currency,
            paymentSchedule,
            features,
            milestones,
          }),
        });
        await onSuccess(
          res.agreementId,
          `Digital Agreement v1 created & signed by you! Waiting for the other party to co-sign to lock on blockchain.`
        );
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="tw-card max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between border-b border-slate-200 pb-3">
          <div>
            <span className="text-xs font-bold text-indigo-600 uppercase">
              {isAmend
                ? `Mutual Modification · Agreement v${parentAgreement.version} ➔ v${parentAgreement.version + 1}`
                : 'Dual-Party Blockchain Digital Agreement'}
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5">
              {isAmend
                ? 'Propose Updated Time, Cost, or Features (Requires Both Signatures)'
                : 'Agree on Timeline, Cost, Features & Milestones'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="tw-btn-secondary px-3 py-1.5 text-xs">
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {!isAmend && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Gig Provider (Client)</label>
                <select
                  value={clientDid}
                  onChange={(e) => setClientDid(e.target.value)}
                  className="tw-input text-xs"
                >
                  {identities.map((u) => (
                    <option key={u.did} value={u.did}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Freelancer</label>
                <select
                  value={freelancerDid}
                  onChange={(e) => setFreelancerDid(e.target.value)}
                  className="tw-input text-xs"
                >
                  {identities.map((u) => (
                    <option key={u.did} value={u.did}>
                      {u.name} ({u.headline})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {isAmend && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <label className="block font-semibold text-amber-900 mb-1">
                What is changing and why? (Shown to counterparty for co-signing)
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Adding mobile push notifications (+₹80,000 and +10 days)"
                value={amendmentReason}
                onChange={(e) => setAmendmentReason(e.target.value)}
                className="tw-input text-xs"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Project Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="tw-input text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="tw-input text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Agreement Summary</label>
            <textarea
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="tw-input text-xs"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="tw-input text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Deadline</label>
              <input
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="tw-input text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Duration (Days)</label>
              <input
                type="number"
                required
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                className="tw-input text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Total Price</label>
              <input
                type="number"
                required
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                className="tw-input text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="tw-input text-xs font-mono"
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="ETH">ETH</option>
              </select>
            </div>
          </div>

          {/* Features */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Agreed Features &amp; Acceptance Criteria</span>
              <button
                type="button"
                onClick={() =>
                  setFeatures([
                    ...features,
                    { name: '', description: '', acceptanceCriteria: 'Verified by client' },
                  ])
                }
                className="text-indigo-600 font-semibold hover:underline cursor-pointer"
              >
                + Add Feature
              </button>
            </div>
            {features.map((f, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Feature name"
                  value={f.name}
                  onChange={(e) => {
                    const next = [...features];
                    next[idx] = { ...next[idx], name: e.target.value };
                    setFeatures(next);
                  }}
                  className="tw-input text-xs"
                />
                <input
                  type="text"
                  placeholder="Details"
                  value={f.description}
                  onChange={(e) => {
                    const next = [...features];
                    next[idx] = { ...next[idx], description: e.target.value };
                    setFeatures(next);
                  }}
                  className="tw-input text-xs"
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
                  className="tw-input text-xs"
                />
              </div>
            ))}
          </div>

          {/* Milestones */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Milestones &amp; Payouts</span>
              <button
                type="button"
                onClick={() =>
                  setMilestones([
                    ...milestones,
                    {
                      title: `Milestone ${milestones.length + 1}`,
                      deliverables: 'Deliverable package',
                      dueDate: deadline,
                      amount: 50000,
                    },
                  ])
                }
                className="text-indigo-600 font-semibold hover:underline cursor-pointer"
              >
                + Add Milestone
              </button>
            </div>
            {milestones.map((m, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input
                  type="text"
                  required
                  value={m.title}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[idx] = { ...next[idx], title: e.target.value };
                    setMilestones(next);
                  }}
                  className="tw-input text-xs"
                  placeholder="Title"
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
                  className="tw-input text-xs"
                  placeholder="Deliverables"
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
                  className="tw-input text-xs font-mono"
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
                  className="tw-input text-xs font-mono"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="tw-btn-secondary px-4 py-2 text-xs">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="tw-btn-primary px-5 py-2 text-xs"
            >
              {submitting
                ? 'Signing...'
                : isAmend
                  ? `Sign & Send Modification Request (v${parentAgreement.version + 1})`
                  : 'Sign & Send Digital Agreement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeliverableModal({ milestone, currentUser, onClose, onSubmitted, showToast }) {
  const [commitHash, setCommitHash] = useState('e49a71c308bf19d4421a87e0c2155b908f12ca19');
  const [repoUrl, setRepoUrl] = useState('https://github.com/trustwork-builds/project/commit/e49a71c');
  const [evidenceNotes, setEvidenceNotes] = useState(
    `Completed ${milestone.title} with full automated tests passing.`
  );
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/milestones/${milestone.id}/submit-evidence`, {
        method: 'POST',
        body: JSON.stringify({
          actorDid: currentUser.did,
          commitHash,
          repoUrl,
          evidenceNotes,
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
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="tw-card max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="font-bold text-base text-slate-900">Submit Milestone Deliverable Proof</h3>
          <button type="button" onClick={onClose} className="tw-btn-secondary px-3 py-1 text-xs">
            Cancel
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Git Commit Hash</label>
            <input
              type="text"
              required
              value={commitHash}
              onChange={(e) => setCommitHash(e.target.value)}
              className="tw-input font-mono text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Repository / Live Preview Link</label>
            <input
              type="url"
              required
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="tw-input text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Delivery Notes</label>
            <textarea
              rows={3}
              required
              value={evidenceNotes}
              onChange={(e) => setEvidenceNotes(e.target.value)}
              className="tw-input text-xs"
            />
          </div>
          <button type="submit" disabled={busy} className="tw-btn-primary w-full py-2.5 text-xs">
            {busy ? 'Hashing & Signing...' : 'Sign & Submit Deliverable'}
          </button>
        </form>
      </div>
    </div>
  );
}

function IssueVcModal({ agreement, currentUser, onClose, onIssued, showToast }) {
  const [rolePerformed, setRolePerformed] = useState('Lead Freelance Engineer');
  const [summaryStatement, setSummaryStatement] = useState(
    `${agreement.freelancerName} delivered ${agreement.title} on schedule with verified milestone proofs.`
  );
  const [skillsText, setSkillsText] = useState('Distributed Systems, Backend, API Design');
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
          issuerDid: currentUser.did,
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
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="tw-card max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <span className="text-xs font-bold text-indigo-600 uppercase">
              Portable W3C Verifiable Credential
            </span>
            <h3 className="font-bold text-base text-slate-900 mt-0.5">
              Issue Verified Work Credential to {agreement.freelancerName}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="tw-btn-secondary px-3 py-1 text-xs">
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Role Performed</label>
            <input
              type="text"
              required
              value={rolePerformed}
              onChange={(e) => setRolePerformed(e.target.value)}
              className="tw-input text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Client Endorsement Statement</label>
            <textarea
              rows={2}
              required
              value={summaryStatement}
              onChange={(e) => setSummaryStatement(e.target.value)}
              className="tw-input text-xs"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Verified Skills</label>
              <input
                type="text"
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
                className="tw-input text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Rating</label>
              <select
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="tw-input text-xs"
              >
                <option value={5}>5.0 ★</option>
                <option value={4}>4.0 ★</option>
                <option value={3}>3.0 ★</option>
              </select>
            </div>
          </div>

          <button type="submit" disabled={busy} className="tw-btn-primary w-full py-2.5 text-xs">
            {busy ? 'Signing & Anchoring...' : 'Sign & Mint Portable Credential'}
          </button>
        </form>
      </div>
    </div>
  );
}
