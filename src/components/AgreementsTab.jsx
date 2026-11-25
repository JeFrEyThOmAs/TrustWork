import React, { useMemo, useState } from 'react';
import {
  FileSignature,
  Plus,
  CheckCircle2,
  Clock,
  ShieldAlert,
  GitBranch,
  ArrowRight,
  Lock,
  AlertTriangle,
  Sparkles,
  XCircle,
  SearchCheck,
  RefreshCw,
} from 'lucide-react';
import {
  apiFetch,
  formatCurrency,
  shortHex,
  signDigestWithBrowserWallet,
  statusBadge,
  tierMeta,
} from '../lib/wallet.js';

export default function AgreementsTab({
  agreements,
  identities,
  activePersona,
  selectedAgreementId,
  setSelectedAgreementId,
  onRefresh,
  onOpenAudit,
  onGoToMilestones,
  showToast,
}) {
  const [filter, setFilter] = useState('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [amendTarget, setAmendTarget] = useState(null);
  const [tamperModal, setTamperModal] = useState(null);
  const [tamperResult, setTamperResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const filteredAgreements = useMemo(() => {
    return agreements.filter((ag) => {
      if (filter === 'ACTION_NEEDED') {
        return ag.status === 'PENDING_SIGNATURES' || ag.status === 'AMENDMENT_PENDING';
      }
      if (filter === 'ACTIVE') return ag.status === 'ACTIVE';
      if (filter === 'COMPLETED') return ag.status === 'COMPLETED';
      if (filter === 'SUPERSEDED') return ag.status === 'SUPERSEDED';
      return true;
    });
  }, [agreements, filter]);

  const selected = useMemo(() => {
    return (
      agreements.find((a) => a.id === selectedAgreementId) ||
      filteredAgreements[0] ||
      agreements[0] ||
      null
    );
  }, [agreements, filteredAgreements, selectedAgreementId]);

  // Lineage chain for currently selected agreement (v1 -> v2 -> pending v3...)
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

  async function maybeExternalSignature(persona, digestHex) {
    if (persona.hasCustodialKey) return null;
    return signDigestWithBrowserWallet(persona.address, digestHex);
  }

  async function handleCoSignInitial(ag) {
    if (!activePersona) return;
    setBusy(true);
    try {
      const extSig = await maybeExternalSignature(activePersona, ag.signingDigest);
      const res = await apiFetch(`/api/agreements/${ag.id}/cosign`, {
        method: 'POST',
        body: JSON.stringify({
          actorDid: activePersona.did,
          signature: extSig,
        }),
      });
      showToast(
        `Both signatures verified! Agreement v1 anchored at EVM Block #${res.receipt.blockNumber}`
      );
      await onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleCoSignAmendment(proposal) {
    if (!activePersona) return;
    setBusy(true);
    try {
      const extSig = await maybeExternalSignature(activePersona, proposal.signingDigest);
      const res = await apiFetch(`/api/agreements/${proposal.id}/cosign-amendment`, {
        method: 'POST',
        body: JSON.stringify({
          actorDid: activePersona.did,
          signature: extSig,
        }),
      });
      showToast(
        `Mutual Amendment Anchored! v${proposal.version - 1} marked SUPERSEDED -> New Agreement v${proposal.version} ACTIVE at Block #${res.receipt.blockNumber}`
      );
      setSelectedAgreementId(proposal.id);
      await onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleRejectProposal(ag) {
    if (!activePersona) return;
    setBusy(true);
    try {
      await apiFetch(`/api/agreements/${ag.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({
          actorDid: activePersona.did,
          reason: `Declined by ${activePersona.name}`,
        }),
      });
      showToast('Proposal declined. Active on-chain agreement remains untouched.');
      await onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function runTamperSimulation(e) {
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

  const isPartyOnSelected =
    selected &&
    activePersona &&
    (selected.clientDid === activePersona.did || selected.freelancerDid === activePersona.did);

  const needsMyInitialSig =
    selected?.status === 'PENDING_SIGNATURES' &&
    activePersona &&
    ((selected.clientDid === activePersona.did && !selected.clientSignature) ||
      (selected.freelancerDid === activePersona.did && !selected.freelancerSignature));

  const needsMyAmendmentSig =
    selected?.status === 'AMENDMENT_PENDING' &&
    activePersona &&
    ((selected.clientDid === activePersona.did && !selected.clientSignature) ||
      (selected.freelancerDid === activePersona.did && !selected.freelancerSignature));

  return (
    <div className="space-y-5">
      {/* Top Action & Filter Bar */}
      <div className="brutal-card p-4 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 bg-[#0284C7] text-white border border-[#111827]">
              DUAL-SIGNATURE BLOCKCHAIN CONTRACT ENGINE
            </span>
          </div>
          <h2 className="text-xl font-bold mt-1">
            Digital Agreements &amp; Mutual Amendment Versioning
          </h2>
          <p className="text-xs text-slate-600">
            Time, cost, features &amp; milestones are anchored on-chain only when BOTH Freelancer and Gig Provider sign. Any modification requires mutual signatures to mint a new Agreement version.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="brutal-btn bg-[#F59E0B] text-[#111827] px-4 py-2.5 text-sm flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Digital Agreement</span>
        </button>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'ALL', label: `All (${agreements.length})` },
          {
            id: 'ACTION_NEEDED',
            label: `Awaiting Co-Signature (${
              agreements.filter(
                (a) => a.status === 'PENDING_SIGNATURES' || a.status === 'AMENDMENT_PENDING'
              ).length
            })`,
          },
          {
            id: 'ACTIVE',
            label: `Active On-Chain (${agreements.filter((a) => a.status === 'ACTIVE').length})`,
          },
          {
            id: 'COMPLETED',
            label: `Completed (${agreements.filter((a) => a.status === 'COMPLETED').length})`,
          },
          {
            id: 'SUPERSEDED',
            label: `Superseded History (${agreements.filter((a) => a.status === 'SUPERSEDED').length})`,
          },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`brutal-btn px-3 py-1 text-xs font-mono ${
              filter === f.id ? 'bg-[#111827] text-white' : 'bg-white text-[#111827]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Master-Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left List */}
        <div className="lg:col-span-4 space-y-3">
          {filteredAgreements.map((ag) => {
            const isSelected = selected?.id === ag.id;
            const waitingForActiveUser =
              (ag.status === 'PENDING_SIGNATURES' || ag.status === 'AMENDMENT_PENDING') &&
              ((ag.clientDid === activePersona?.did && !ag.clientSignature) ||
                (ag.freelancerDid === activePersona?.did && !ag.freelancerSignature));

            return (
              <div
                key={ag.id}
                onClick={() => setSelectedAgreementId(ag.id)}
                className={`p-3.5 border-2 border-[#111827] cursor-pointer transition ${
                  isSelected
                    ? 'bg-[#FEF3C7] shadow-[4px_4px_0px_#111827]'
                    : 'bg-white hover:bg-amber-50/40 shadow-[2px_2px_0px_#111827]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 border ${statusBadge(ag.status)}`}
                  >
                    {ag.status} · v{ag.version}
                  </span>
                  <span className="font-mono font-bold text-xs">
                    {formatCurrency(ag.totalCost, ag.currency)}
                  </span>
                </div>
                <h3 className="font-bold text-sm mt-2 leading-snug">{ag.title}</h3>
                <div className="text-xs text-slate-600 mt-1">
                  <span className="font-semibold">{ag.clientName}</span> ↔{' '}
                  <span className="font-semibold">{ag.freelancerName}</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200 text-[11px] font-mono text-slate-500">
                  <span>Due: {ag.deadline}</span>
                  {waitingForActiveUser ? (
                    <span className="text-[#E11D48] font-bold">● Sign Required</span>
                  ) : ag.blockNumber ? (
                    <span className="text-emerald-700 font-bold">Block #{ag.blockNumber}</span>
                  ) : (
                    <span>Off-Chain Draft</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Agreement Detail Workspace */}
        {selected && (
          <div className="lg:col-span-8 space-y-4">
            {/* Immutable Version Lineage Strip */}
            <div className="brutal-card-sm p-3 bg-white flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase flex items-center gap-1 text-slate-600 mr-1">
                <GitBranch className="w-4 h-4 text-[#0284C7]" />
                Version Chain:
              </span>
              {lineage.map((ver, idx) => (
                <React.Fragment key={ver.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedAgreementId(ver.id)}
                    className={`px-2.5 py-1 text-xs font-mono border-2 border-[#111827] font-bold ${
                      ver.id === selected.id
                        ? 'bg-[#111827] text-white'
                        : ver.status === 'AMENDMENT_PENDING'
                          ? 'bg-rose-100 text-rose-900'
                          : 'bg-[#FAF7F0] text-[#111827]'
                    }`}
                  >
                    v{ver.version} · {ver.status} ({formatCurrency(ver.totalCost, ver.currency)})
                  </button>
                  {idx < lineage.length - 1 && (
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Banner if there is a Pending Child Amendment on this Active Agreement */}
            {selected.status === 'ACTIVE' && pendingChildAmendment && (
              <div className="brutal-card p-4 bg-rose-50 border-l-8 border-l-[#E11D48] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase bg-[#E11D48] text-white px-2 py-0.5">
                    PENDING MUTUAL AMENDMENT PROPOSAL (v{pendingChildAmendment.version})
                  </span>
                  <p className="text-xs font-bold mt-1">
                    A modification proposal exists for this contract. Notice that v{selected.version} remains 100% ACTIVE and untampered on-chain until both parties sign v{pendingChildAmendment.version}!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAgreementId(pendingChildAmendment.id)}
                  className="brutal-btn bg-[#111827] text-white px-3 py-1.5 text-xs shrink-0"
                >
                  Inspect Diff &amp; Co-Sign v{pendingChildAmendment.version}
                </button>
              </div>
            )}

            {/* Co-Sign Banner for Initial Pending Agreement */}
            {selected.status === 'PENDING_SIGNATURES' && (
              <div className="brutal-card p-4 bg-[#FEF3C7] border-l-8 border-l-[#F59E0B]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-mono font-bold uppercase bg-[#111827] text-[#F59E0B] px-2 py-0.5">
                      DUAL-SIGNATURE GATEWAY · VERSION 1
                    </span>
                    <h4 className="font-bold text-sm mt-1">
                      {needsMyInitialSig
                        ? `Action Required (${activePersona.name}): Review terms & co-sign to anchor on blockchain.`
                        : `Waiting for counterparty (${
                            !selected.clientSignature ? selected.clientName : selected.freelancerName
                          }) to co-sign. Switch persona in top-right to sign as them!`}
                    </h4>
                  </div>
                  {needsMyInitialSig && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleCoSignInitial(selected)}
                        className="brutal-btn bg-[#059669] text-white px-4 py-2 text-xs"
                      >
                        {busy ? 'Anchoring...' : '✓ Co-Sign & Anchor On-Chain'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRejectProposal(selected)}
                        className="brutal-btn bg-white text-red-700 px-3 py-2 text-xs"
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Side-by-Side Diff & Co-Sign Banner for Mutual Amendment (v2+) */}
            {parentAgreement && (
              <div className="brutal-card p-4 bg-white border-t-4 border-t-[#E11D48]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <span className="text-[11px] font-mono font-bold uppercase bg-rose-100 text-rose-900 border border-[#111827] px-2 py-0.5">
                      MUTUAL AMENDMENT DIFF · v{parentAgreement.version} ➔ v{selected.version}
                    </span>
                    <p className="text-xs text-slate-700 mt-1 font-medium">
                      <strong>Reason:</strong> {selected.amendmentReason || 'Scope & terms update'}
                    </p>
                  </div>

                  {selected.status === 'AMENDMENT_PENDING' &&
                    (needsMyAmendmentSig ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleCoSignAmendment(selected)}
                          className="brutal-btn bg-[#059669] text-white px-4 py-2 text-xs"
                        >
                          {busy
                            ? 'Minting New Version...'
                            : `✓ Approve & Mint Agreement v${selected.version}`}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRejectProposal(selected)}
                          className="brutal-btn bg-white text-red-700 px-3 py-2 text-xs"
                        >
                          Reject Change
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-mono bg-amber-100 border border-[#111827] px-2.5 py-1">
                        Awaiting{' '}
                        {!selected.clientSignature ? selected.clientName : selected.freelancerName}{' '}
                        signature (Switch identity above to co-sign)
                      </span>
                    ))}
                </div>

                {/* Diff Comparison Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-2.5 bg-[#FAF7F0] border border-[#111827]">
                    <div className="text-slate-500">COMPENSATION DELTA</div>
                    <div className="mt-1">
                      <span className="line-through text-red-600 mr-1.5">
                        {formatCurrency(parentAgreement.totalCost, parentAgreement.currency)}
                      </span>
                      <span className="font-bold text-emerald-700">
                        ➔ {formatCurrency(selected.totalCost, selected.currency)}
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#FAF7F0] border border-[#111827]">
                    <div className="text-slate-500">DEADLINE SHIFT</div>
                    <div className="mt-1">
                      <span className="line-through text-red-600 mr-1.5">
                        {parentAgreement.deadline}
                      </span>
                      <span className="font-bold text-sky-800">➔ {selected.deadline}</span>
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#FAF7F0] border border-[#111827]">
                    <div className="text-slate-500">FEATURES / MILESTONES</div>
                    <div className="mt-1 font-bold">
                      {parentAgreement.features.length} ➔ {selected.features.length} Features ·{' '}
                      {parentAgreement.milestonesSpec.length} ➔ {selected.milestonesSpec.length}{' '}
                      Milestones
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Main Agreement Specification Card */}
            <div className="brutal-card p-5 bg-white space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b-2 border-[#111827] pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 border ${statusBadge(selected.status)}`}
                    >
                      {selected.status} · VERSION {selected.version}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 bg-slate-100 border border-[#111827]">
                      {selected.category}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold mt-2">{selected.title}</h3>
                  <p className="text-xs text-slate-600 mt-1">{selected.summary}</p>
                </div>

                {/* Action Toolbar on Active / Anchored Agreement */}
                <div className="flex flex-wrap gap-2 shrink-0">
                  {selected.status === 'ACTIVE' && !pendingChildAmendment && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!isPartyOnSelected) {
                          showToast(
                            `Switch Signing Identity in the header to ${selected.clientName} or ${selected.freelancerName} to propose a contract modification.`,
                            'error'
                          );
                          return;
                        }
                        setAmendTarget(selected);
                      }}
                      className="brutal-btn bg-[#F59E0B] text-[#111827] px-3 py-1.5 text-xs flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Propose Change (Mutual Amendment)</span>
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
                            tamperedCost: Math.round(selected.totalCost * 0.6),
                            tamperedDeadline: selected.deadline,
                            tamperedFeatureTitle:
                              (selected.features[0]?.name || 'Core Module') +
                              ' + Unpaid Extra Scope',
                          });
                        }}
                        className="brutal-btn bg-rose-100 text-rose-950 px-3 py-1.5 text-xs flex items-center gap-1.5"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-[#E11D48]" />
                        <span>Simulate Unilateral Tamper</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenAudit('agreement', selected.id, selected.canonicalPayload)}
                        className="brutal-btn bg-white px-3 py-1.5 text-xs flex items-center gap-1.5"
                      >
                        <SearchCheck className="w-3.5 h-3.5 text-[#059669]" />
                        <span>1-Sec Audit</span>
                      </button>
                    </>
                  )}

                  {(selected.status === 'ACTIVE' || selected.status === 'COMPLETED') && (
                    <button
                      type="button"
                      onClick={() => onGoToMilestones(selected.id)}
                      className="brutal-btn bg-[#111827] text-white px-3 py-1.5 text-xs"
                    >
                      Milestones ({selected.milestones?.length || 0}) ➔
                    </button>
                  )}
                </div>
              </div>

              {/* Dual Parties + Cryptographic Signatures */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 bg-[#FAF7F0] border-2 border-[#111827]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase text-slate-500">
                      PARTY A · GIG PROVIDER (CLIENT)
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 border ${tierMeta(selected.clientTier).bg}`}
                    >
                      {tierMeta(selected.clientTier).label}
                    </span>
                  </div>
                  <div className="font-bold text-sm mt-1">{selected.clientName}</div>
                  <div className="font-mono text-[11px] text-slate-600 truncate">
                    {selected.clientDid}
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-300 flex items-center justify-between text-xs font-mono">
                    {selected.clientSignature ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        ECDSA Signed ({shortHex(selected.clientSignature, 10, 6)})
                      </span>
                    ) : (
                      <span className="text-amber-700 font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Pending Signature
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3.5 bg-[#FAF7F0] border-2 border-[#111827]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase text-slate-500">
                      PARTY B · FREELANCER
                    </span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 border bg-white">
                      SELF-CONTROLLED DID
                    </span>
                  </div>
                  <div className="font-bold text-sm mt-1">{selected.freelancerName}</div>
                  <div className="font-mono text-[11px] text-slate-600 truncate">
                    {selected.freelancerDid}
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-300 flex items-center justify-between text-xs font-mono">
                    {selected.freelancerSignature ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        ECDSA Signed ({shortHex(selected.freelancerSignature, 10, 6)})
                      </span>
                    ) : (
                      <span className="text-amber-700 font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Pending Signature
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Agreed Time & Cost Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 border border-[#111827] bg-amber-50/60">
                  <div className="text-[10px] font-mono uppercase text-slate-500">TOTAL AGREED COST</div>
                  <div className="text-lg font-bold font-mono mt-0.5">
                    {formatCurrency(selected.totalCost, selected.currency)}
                  </div>
                </div>
                <div className="p-3 border border-[#111827] bg-white">
                  <div className="text-[10px] font-mono uppercase text-slate-500">START DATE</div>
                  <div className="text-sm font-bold font-mono mt-1">{selected.startDate}</div>
                </div>
                <div className="p-3 border border-[#111827] bg-white">
                  <div className="text-[10px] font-mono uppercase text-slate-500">DEADLINE</div>
                  <div className="text-sm font-bold font-mono mt-1">{selected.deadline}</div>
                </div>
                <div className="p-3 border border-[#111827] bg-white">
                  <div className="text-[10px] font-mono uppercase text-slate-500">DURATION / TERMS</div>
                  <div className="text-xs font-bold mt-1">
                    {selected.durationDays} Days · {selected.paymentSchedule}
                  </div>
                </div>
              </div>

              {/* Agreed Features & Scope Specification */}
              <div>
                <h4 className="text-xs font-mono font-bold uppercase text-slate-700 mb-2">
                  Agreed Features &amp; Acceptance Criteria ({selected.features.length})
                </h4>
                <div className="space-y-2">
                  {selected.features.map((feat, idx) => (
                    <div key={idx} className="p-3 border border-[#111827] bg-[#FAF7F0] text-xs">
                      <div className="flex items-center justify-between font-bold">
                        <span>
                          F{idx + 1}. {feat.name}
                        </span>
                        <span className="font-mono text-[10px] bg-white px-2 py-0.5 border border-[#111827]">
                          Criteria: {feat.acceptanceCriteria}
                        </span>
                      </div>
                      {feat.description && (
                        <p className="text-slate-600 mt-1">{feat.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Milestones Schedule */}
              <div>
                <h4 className="text-xs font-mono font-bold uppercase text-slate-700 mb-2">
                  Milestone Payment &amp; Deliverable Breakdown ({selected.milestonesSpec.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {selected.milestonesSpec.map((m, idx) => (
                    <div key={idx} className="p-3 border border-[#111827] bg-white text-xs">
                      <div className="flex items-center justify-between font-bold">
                        <span>{m.title}</span>
                        <span className="font-mono text-emerald-800">
                          {formatCurrency(m.amount, selected.currency)}
                        </span>
                      </div>
                      <div className="text-slate-600 mt-1">{m.deliverables}</div>
                      <div className="text-[11px] font-mono text-slate-500 mt-1">
                        Target Due: {m.dueDate}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* On-Chain Cryptographic Anchor Metadata */}
              <div className="p-3.5 bg-slate-950 text-slate-200 font-mono text-xs space-y-1 border-2 border-[#111827]">
                <div className="text-[#F59E0B] font-bold uppercase text-[11px] mb-1 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Immutable Cryptographic Fingerprint (Keccak-256 + EVM Storage)
                </div>
                <div className="break-all">
                  <span className="text-slate-400">Agreement ID: </span>
                  {selected.id}
                </div>
                <div className="break-all">
                  <span className="text-slate-400">Canonical Terms Hash: </span>
                  <span className="text-emerald-400">{selected.termsHash}</span>
                </div>
                <div className="break-all">
                  <span className="text-slate-400">IPFS Content CID: </span>
                  <span className="text-sky-300">{selected.ipfsCid}</span>
                </div>
                {selected.txHash && (
                  <div className="break-all">
                    <span className="text-slate-400">On-Chain Anchor Tx (Block #{selected.blockNumber}): </span>
                    <span className="text-amber-300">{selected.txHash}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create OR Amend Agreement Modal */}
      {(createOpen || amendTarget) && (
        <AgreementFormModal
          mode={amendTarget ? 'amend' : 'create'}
          parentAgreement={amendTarget}
          identities={identities}
          activePersona={activePersona}
          onClose={() => {
            setCreateOpen(false);
            setAmendTarget(null);
          }}
          onSuccess={async (createdId, msg) => {
            setCreateOpen(false);
            setAmendTarget(null);
            await onRefresh();
            if (createdId) setSelectedAgreementId(createdId);
            showToast(msg);
          }}
          showToast={showToast}
        />
      )}

      {/* Simulate Unilateral Tamper Attack Modal */}
      {tamperModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="brutal-card bg-white max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between border-b-2 border-[#111827] pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase bg-[#E11D48] text-white px-2 py-0.5">
                  CRYPTOGRAPHIC TAMPER RESISTANCE SIMULATOR
                </span>
                <h3 className="font-bold text-lg mt-1">
                  Test Unilateral Modification Attack (Single-Party Tampering)
                </h3>
                <p className="text-xs text-slate-600">
                  Try altering the agreed Cost, Deadline, or Feature scope as ONE party without the counterparty&apos;s cryptographic signature.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTamperModal(null)}
                className="brutal-btn bg-white px-2.5 py-1 text-xs"
              >
                Close
              </button>
            </div>

            <form onSubmit={runTamperSimulation} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-mono font-bold mb-1">Unilateral Actor</label>
                  <select
                    value={tamperModal.attackerDid}
                    onChange={(e) =>
                      setTamperModal({ ...tamperModal, attackerDid: e.target.value })
                    }
                    className="brutal-input w-full text-xs"
                  >
                    <option value={tamperModal.agreement.clientDid}>
                      Gig Provider ({tamperModal.agreement.clientName}) alone
                    </option>
                    <option value={tamperModal.agreement.freelancerDid}>
                      Freelancer ({tamperModal.agreement.freelancerName}) alone
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block font-mono font-bold mb-1">
                    Tampered Cost ({tamperModal.agreement.currency})
                  </label>
                  <input
                    type="number"
                    value={tamperModal.tamperedCost}
                    onChange={(e) =>
                      setTamperModal({ ...tamperModal, tamperedCost: e.target.value })
                    }
                    className="brutal-input w-full text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block font-mono font-bold mb-1">Tampered Deadline</label>
                  <input
                    type="date"
                    value={tamperModal.tamperedDeadline}
                    onChange={(e) =>
                      setTamperModal({ ...tamperModal, tamperedDeadline: e.target.value })
                    }
                    className="brutal-input w-full text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono font-bold mb-1">Tampered Feature #1 Scope</label>
                <input
                  type="text"
                  value={tamperModal.tamperedFeatureTitle}
                  onChange={(e) =>
                    setTamperModal({ ...tamperModal, tamperedFeatureTitle: e.target.value })
                  }
                  className="brutal-input w-full text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="brutal-btn bg-[#E11D48] text-white px-4 py-2 text-xs w-full"
              >
                {busy
                  ? 'Executing Against TrustWorkProtocol.sol...'
                  : 'Attempt Unilateral Modification On-Chain'}
              </button>
            </form>

            {tamperResult && (
              <div className="p-4 bg-red-950 text-red-100 border-2 border-[#111827] space-y-2 text-xs font-mono">
                <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                  <XCircle className="w-5 h-5 shrink-0" />
                  <span>UNILATERAL TAMPER BLOCKED BY BLOCKCHAIN!</span>
                </div>
                <div>
                  <span className="text-slate-400">Anchored On-Chain Hash: </span>
                  <span className="text-emerald-300 break-all">
                    {tamperResult.originalTermsHash}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Tampered Payload Hash:  </span>
                  <span className="text-rose-400 break-all">{tamperResult.tamperedTermsHash}</span>
                </div>
                <div>
                  <span className="text-slate-400">On-Chain Hash Audit: </span>
                  <span className="bg-red-700 text-white px-1.5 py-0.5 font-bold">
                    MISMATCH (hashMatches = false)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">EVM Execution Result: </span>
                  <span className="text-amber-300 font-bold">
                    {tamperResult.evmContractResponse}
                  </span>
                </div>
                <p className="font-sans text-xs text-slate-200 pt-2 border-t border-red-800">
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

function AgreementFormModal({
  mode,
  parentAgreement,
  identities,
  activePersona,
  onClose,
  onSuccess,
  showToast,
}) {
  const isAmend = mode === 'amend' && parentAgreement;

  const defaultClient =
    identities.find((i) => i.did === activePersona?.did && i.role === 'CLIENT')?.did ||
    identities.find((i) => i.role === 'CLIENT')?.did ||
    identities[0]?.did;

  const defaultFreelancer =
    identities.find(
      (i) => i.did === activePersona?.did && i.role !== 'CLIENT' && i.did !== defaultClient
    )?.did ||
    identities.find((i) => i.did !== defaultClient)?.did ||
    identities[1]?.did;

  const [title, setTitle] = useState(
    isAmend ? parentAgreement.title : 'Decentralized Supply-Chain Provenance API'
  );
  const [summary, setSummary] = useState(
    isAmend
      ? parentAgreement.summary
      : 'Build high-availability GraphQL indexer & cryptographic shipment attestation microservice.'
  );
  const [category, setCategory] = useState(
    isAmend ? parentAgreement.category : 'Distributed Systems & Web3'
  );
  const [clientDid, setClientDid] = useState(isAmend ? parentAgreement.clientDid : defaultClient);
  const [freelancerDid, setFreelancerDid] = useState(
    isAmend ? parentAgreement.freelancerDid : defaultFreelancer
  );
  const [startDate, setStartDate] = useState(
    isAmend ? parentAgreement.startDate : '2026-11-26'
  );
  const [deadline, setDeadline] = useState(isAmend ? parentAgreement.deadline : '2026-12-28');
  const [durationDays, setDurationDays] = useState(
    isAmend ? parentAgreement.durationDays : 32
  );
  const [totalCost, setTotalCost] = useState(isAmend ? parentAgreement.totalCost : 540000);
  const [currency, setCurrency] = useState(isAmend ? parentAgreement.currency : 'INR');
  const [paymentSchedule, setPaymentSchedule] = useState(
    isAmend ? parentAgreement.paymentSchedule : 'Milestone-Based (50% / 50%)'
  );
  const [amendmentReason, setAmendmentReason] = useState('');

  const [features, setFeatures] = useState(
    isAmend
      ? parentAgreement.features
      : [
          {
            name: 'Event-Driven Shipment Indexer',
            description: 'Real-time EVM log consumer with deterministic reorg handling.',
            acceptanceCriteria: 'Zero missed events across 10k simulated blocks',
          },
          {
            name: 'REST & GraphQL Verification Gateway',
            description: 'Authenticated API with sub-40ms response caching.',
            acceptanceCriteria: 'OpenAPI spec + 95% integration test pass',
          },
        ]
  );

  const [milestones, setMilestones] = useState(
    isAmend
      ? parentAgreement.milestonesSpec
      : [
          {
            title: 'Milestone 1: Core Indexer & Database Schema',
            deliverables: 'Indexer daemon, schema migrations, unit tests',
            dueDate: '2026-12-12',
            amount: 270000,
          },
          {
            title: 'Milestone 2: GraphQL Gateway & Load Test',
            deliverables: 'API server, Docker Compose stack, benchmark report',
            dueDate: '2026-12-28',
            amount: 270000,
          },
        ]
  );

  const [submitting, setSubmitting] = useState(false);

  function addFeature() {
    setFeatures([
      ...features,
      {
        name: '',
        description: '',
        acceptanceCriteria: 'Verified pass on acceptance suite',
      },
    ]);
  }

  function addMilestone() {
    setMilestones([
      ...milestones,
      {
        title: `Milestone ${milestones.length + 1}: New Deliverable Stage`,
        deliverables: '',
        dueDate: deadline,
        amount: 100000,
      },
    ]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const proposerDid =
        activePersona?.did === clientDid || activePersona?.did === freelancerDid
          ? activePersona.did
          : clientDid;
      const proposerIdentity = identities.find((i) => i.did === proposerDid);
      const nonceSeed = Math.random().toString(36).slice(2, 10);

      let proposerSignature = null;
      let agreementIdOverride = null;

      if (proposerIdentity && !proposerIdentity.hasCustodialKey) {
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
            paymentSchedule,
            features,
            milestones,
            amendmentReason,
            nonceSeed,
          }),
        });
        agreementIdOverride = prep.agreementId;
        proposerSignature = await signDigestWithBrowserWallet(
          proposerIdentity.address,
          prep.signingDigest
        );
      }

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
            proposerSignature,
            agreementIdOverride,
            nonceSeed,
          }),
        });
        await onSuccess(
          res.newAgreementId,
          `Signed Amendment Proposal v${res.version}! Switch to the counterparty identity to review the diff & co-sign on-chain.`
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
            proposerSignature,
            agreementIdOverride,
            nonceSeed,
          }),
        });
        await onSuccess(
          res.agreementId,
          `Digital Agreement v1 proposed & cryptographically signed! Counterparty co-signature required to anchor on blockchain.`
        );
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="brutal-card bg-[#FAF7F0] max-w-3xl w-full max-h-[92vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between border-b-2 border-[#111827] pb-3 mb-4">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 bg-[#111827] text-[#F59E0B]">
              {isAmend
                ? `PROPOSE MUTUAL AMENDMENT · v${parentAgreement.version} ➔ v${parentAgreement.version + 1}`
                : 'NEW DUAL-PARTY BLOCKCHAIN DIGITAL AGREEMENT'}
            </span>
            <h3 className="font-bold text-lg mt-1">
              {isAmend
                ? 'Modify Time, Cost, Features or Milestones (Requires Counterparty Co-Sign)'
                : 'Define Project Scope, Timeline, Cost & Features'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="brutal-btn bg-white px-3 py-1 text-xs"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {!isAmend && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-mono font-bold mb-1">Gig Provider (Client DID)</label>
                <select
                  value={clientDid}
                  onChange={(e) => setClientDid(e.target.value)}
                  className="brutal-input w-full text-xs"
                >
                  {identities.map((id) => (
                    <option key={id.did} value={id.did}>
                      {id.name} ({id.issuerTier})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-mono font-bold mb-1">Freelancer DID</label>
                <select
                  value={freelancerDid}
                  onChange={(e) => setFreelancerDid(e.target.value)}
                  className="brutal-input w-full text-xs"
                >
                  {identities.map((id) => (
                    <option key={id.did} value={id.did}>
                      {id.name} ({id.headline || id.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {isAmend && (
            <div className="p-3 bg-amber-100 border-2 border-[#111827]">
              <label className="block font-mono font-bold mb-1 text-amber-950">
                Amendment Summary / Reason for Modification (Required)
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Added mobile push notifications feature (+₹1,20,000 and +10 days timeline)"
                value={amendmentReason}
                onChange={(e) => setAmendmentReason(e.target.value)}
                className="brutal-input w-full text-xs"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-mono font-bold mb-1">Agreement Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="brutal-input w-full text-xs"
              />
            </div>
            <div>
              <label className="block font-mono font-bold mb-1">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="brutal-input w-full text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block font-mono font-bold mb-1">Scope Summary</label>
            <textarea
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="brutal-input w-full text-xs"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block font-mono font-bold mb-1">Start Date</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="brutal-input w-full text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-mono font-bold mb-1">Deadline</label>
              <input
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="brutal-input w-full text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-mono font-bold mb-1">Duration (Days)</label>
              <input
                type="number"
                required
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                className="brutal-input w-full text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-mono font-bold mb-1">Total Cost</label>
              <input
                type="number"
                required
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                className="brutal-input w-full text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-mono font-bold mb-1">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="brutal-input w-full text-xs font-mono"
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="ETH">ETH</option>
              </select>
            </div>
          </div>

          {/* Features Editor */}
          <div className="p-3 bg-white border-2 border-[#111827] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold uppercase">Agreed Features &amp; Acceptance Criteria</span>
              <button
                type="button"
                onClick={addFeature}
                className="brutal-btn bg-amber-100 px-2.5 py-1 text-[11px]"
              >
                + Add Feature
              </button>
            </div>
            {features.map((f, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200">
                <input
                  type="text"
                  required
                  placeholder="Feature Name"
                  value={f.name}
                  onChange={(e) => {
                    const next = [...features];
                    next[idx] = { ...next[idx], name: e.target.value };
                    setFeatures(next);
                  }}
                  className="brutal-input text-xs"
                />
                <input
                  type="text"
                  placeholder="Technical Description"
                  value={f.description}
                  onChange={(e) => {
                    const next = [...features];
                    next[idx] = { ...next[idx], description: e.target.value };
                    setFeatures(next);
                  }}
                  className="brutal-input text-xs"
                />
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="Acceptance Criteria"
                    value={f.acceptanceCriteria}
                    onChange={(e) => {
                      const next = [...features];
                      next[idx] = { ...next[idx], acceptanceCriteria: e.target.value };
                      setFeatures(next);
                    }}
                    className="brutal-input text-xs flex-1"
                  />
                  {features.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFeatures(features.filter((_, i) => i !== idx))}
                      className="px-2 border border-[#111827] bg-red-50 text-red-700 font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Milestones Editor */}
          <div className="p-3 bg-white border-2 border-[#111827] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold uppercase">Milestones &amp; Deliverable Schedule</span>
              <button
                type="button"
                onClick={addMilestone}
                className="brutal-btn bg-sky-100 px-2.5 py-1 text-[11px]"
              >
                + Add Milestone
              </button>
            </div>
            {milestones.map((m, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200">
                <input
                  type="text"
                  required
                  placeholder="Milestone Title"
                  value={m.title}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[idx] = { ...next[idx], title: e.target.value };
                    setMilestones(next);
                  }}
                  className="brutal-input text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="Deliverables"
                  value={m.deliverables}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[idx] = { ...next[idx], deliverables: e.target.value };
                    setMilestones(next);
                  }}
                  className="brutal-input text-xs"
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
                  className="brutal-input text-xs font-mono"
                />
                <div className="flex gap-1">
                  <input
                    type="number"
                    required
                    placeholder="Amount"
                    value={m.amount}
                    onChange={(e) => {
                      const next = [...milestones];
                      next[idx] = { ...next[idx], amount: Number(e.target.value) };
                      setMilestones(next);
                    }}
                    className="brutal-input text-xs font-mono flex-1"
                  />
                  {milestones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setMilestones(milestones.filter((_, i) => i !== idx))}
                      className="px-2 border border-[#111827] bg-red-50 text-red-700 font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="brutal-btn bg-white px-4 py-2 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="brutal-btn bg-[#111827] text-white px-5 py-2 text-xs"
            >
              {submitting
                ? 'Signing Payload...'
                : isAmend
                  ? `Sign & Send Amendment Proposal (v${parentAgreement.version + 1})`
                  : 'Sign & Propose Digital Agreement (v1)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
