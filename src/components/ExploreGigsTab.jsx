import React, { useMemo, useState } from 'react';
import { Search, Plus, Clock, Check } from 'lucide-react';
import { apiFetch, formatCurrency, initials, tierMeta } from '../lib/wallet.js';
import { CryptoSignModal } from './CryptoSignModal.jsx';

export default function ExploreGigsTab({
  gigs,
  currentUser,
  onOpenPostGig,
  onOpenContract,
  onInspectPassport,
  onRefresh,
  showToast,
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [selectedGigId, setSelectedGigId] = useState(null);
  const [applyModalGig, setApplyModalGig] = useState(null);
  const [busyPropId, setBusyPropId] = useState(null);
  const [pendingHireSign, setPendingHireSign] = useState(null);

  const categories = useMemo(() => {
    const s = new Set(gigs.map((g) => g.category));
    return ['ALL', ...Array.from(s)];
  }, [gigs]);

  const filteredGigs = useMemo(() => {
    return gigs.filter((g) => {
      if (statusFilter === 'OPEN' && g.status !== 'OPEN') return false;
      if (category !== 'ALL' && g.category !== category) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${g.title} ${g.description} ${g.posterName} ${g.skills.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [gigs, statusFilter, category, search]);

  const selectedGig = useMemo(() => {
    return (
      filteredGigs.find((g) => g.id === selectedGigId) ||
      filteredGigs[0] ||
      null
    );
  }, [filteredGigs, selectedGigId]);

  async function handleAcceptProposal(proposal) {
    setBusyPropId(proposal.id);
    try {
      const prep = await apiFetch(`/api/proposals/${proposal.id}/prepare-accept`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setPendingHireSign({ proposal, prep });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusyPropId(null);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top Toolbar */}
      <div className="h-14 shrink-0 border-b border-zinc-200 px-6 flex items-center justify-between gap-4 bg-white">
        <div className="flex items-center gap-3 flex-1 max-w-2xl">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search gigs by title, skill, or client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ui-input pl-8 py-1.5 text-xs"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="ui-input w-auto py-1.5 text-xs"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'ALL' ? 'All categories' : c}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ui-input w-auto py-1.5 text-xs"
          >
            <option value="OPEN">Open gigs</option>
            <option value="ALL">All statuses</option>
          </select>
        </div>

        <button
          type="button"
          onClick={onOpenPostGig}
          className="ui-btn-primary flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Post a Gig</span>
        </button>
      </div>

      {/* Full-Height Split Master-Detail Body */}
      {filteredGigs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-sm text-center space-y-3">
            <h2 className="text-sm font-semibold text-zinc-900">No gigs posted yet</h2>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Post a gig from this account, then open TrustWork in another browser window as a freelancer to see it appear live and submit a proposal.
            </p>
            <button
              type="button"
              onClick={onOpenPostGig}
              className="ui-btn-primary inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Post the first gig</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
          {/* Left Gig List */}
          <div className="lg:col-span-5 border-r border-zinc-200 overflow-y-auto divide-y divide-zinc-200 bg-white">
            {filteredGigs.map((g) => {
              const active = selectedGig?.id === g.id;
              return (
                <div
                  key={g.id}
                  onClick={() => setSelectedGigId(g.id)}
                  className={`p-4 cursor-pointer transition ${
                    active ? 'bg-zinc-50' : 'hover:bg-zinc-50/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-zinc-900 leading-snug">
                      {g.title}
                    </h3>
                    <span className="text-xs font-semibold tabular-nums text-zinc-900 shrink-0">
                      {formatCurrency(g.budgetMin, g.currency)}–{formatCurrency(g.budgetMax, g.currency)}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-500 line-clamp-2 mt-1">{g.description}</p>

                  <div className="flex flex-wrap gap-1 mt-2.5">
                    {g.skills.slice(0, 4).map((s) => (
                      <span
                        key={s}
                        className="px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded text-[11px]"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mt-3 text-[11px] text-zinc-500">
                    <span>
                      {g.posterName} · {tierMeta(g.posterTier).label}
                    </span>
                    <span className="tabular-nums">
                      {g.proposalCount} {g.proposalCount === 1 ? 'proposal' : 'proposals'} · Due {g.deadline}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Gig Detail Pane */}
          {selectedGig && (
            <div className="lg:col-span-7 overflow-y-auto p-6 sm:p-8 bg-white">
              <div className="max-w-3xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-zinc-200">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>{selectedGig.category}</span>
                      <span>·</span>
                      <span>{selectedGig.experienceLevel}</span>
                      <span>·</span>
                      <span
                        className={`ui-badge ${
                          selectedGig.status === 'OPEN'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                        }`}
                      >
                        {selectedGig.status}
                      </span>
                    </div>
                    <h1 className="text-xl font-semibold text-zinc-900">{selectedGig.title}</h1>
                    <div className="flex items-center gap-2 text-xs text-zinc-600 pt-1">
                      <span
                        style={{ backgroundColor: selectedGig.posterAvatarColor }}
                        className="w-5 h-5 rounded text-white text-[10px] font-semibold flex items-center justify-center"
                      >
                        {initials(selectedGig.posterName)}
                      </span>
                      <span className="font-medium text-zinc-900">{selectedGig.posterName}</span>
                      {selectedGig.posterOrganization && (
                        <span>({selectedGig.posterOrganization})</span>
                      )}
                      <span className={`ui-badge ${tierMeta(selectedGig.posterTier).badge}`}>
                        {tierMeta(selectedGig.posterTier).label}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col sm:items-end gap-2">
                    <div className="text-right">
                      <div className="text-[11px] text-zinc-500">Budget range</div>
                      <div className="text-base font-semibold tabular-nums text-zinc-900">
                        {formatCurrency(selectedGig.budgetMin, selectedGig.currency)} –{' '}
                        {formatCurrency(selectedGig.budgetMax, selectedGig.currency)}
                      </div>
                    </div>

                    {selectedGig.status === 'OPEN' &&
                      selectedGig.posterDid !== currentUser?.did && (
                        selectedGig.proposals?.some(
                          (p) => p.freelancerDid === currentUser?.did
                        ) ? (
                          <span className="ui-badge bg-emerald-50 text-emerald-800 border-emerald-200 py-1.5 px-3">
                            <Check className="w-3.5 h-3.5 mr-1" />
                            Proposal submitted
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setApplyModalGig(selectedGig)}
                            className="ui-btn-primary"
                          >
                            Apply for this gig
                          </button>
                        )
                      )}
                  </div>
                </div>

                {/* Project Description */}
                <div className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Project Scope
                  </h2>
                  <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line">
                    {selectedGig.description}
                  </p>
                </div>

                {/* Key Metadata */}
                <div className="grid grid-cols-3 gap-4 py-4 border-y border-zinc-200 text-xs">
                  <div>
                    <div className="text-zinc-500">Estimated duration</div>
                    <div className="font-medium text-zinc-900 mt-0.5 tabular-nums">
                      {selectedGig.durationDays} days
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Target deadline</div>
                    <div className="font-medium text-zinc-900 mt-0.5 font-mono">
                      {selectedGig.deadline}
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Proposals received</div>
                    <div className="font-medium text-zinc-900 mt-0.5 tabular-nums">
                      {selectedGig.proposalCount}
                    </div>
                  </div>
                </div>

                {/* Deliverable Features */}
                {selectedGig.features?.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Deliverable Features
                    </h2>
                    <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-200">
                      {selectedGig.features.map((f, idx) => (
                        <div key={idx} className="p-3 flex items-center justify-between text-xs">
                          <span className="font-medium text-zinc-900">{f.name}</span>
                          <span className="text-zinc-500">{f.acceptanceCriteria}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skills */}
                <div className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Skills
                  </h2>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedGig.skills.map((s) => (
                      <span
                        key={s}
                        className="px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-800 text-xs font-medium"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                {/* If Current User Posted This Gig: Inline Incoming Proposals */}
                {selectedGig.posterDid === currentUser?.did && (
                  <div className="pt-4 border-t border-zinc-200 space-y-3">
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Incoming Proposals ({selectedGig.proposals?.length || 0})
                    </h2>
                    {selectedGig.proposals?.length === 0 ? (
                      <p className="text-xs text-zinc-500">
                        Waiting for freelancers to apply. Open TrustWork in another browser and log in with a second account to submit a proposal here.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {selectedGig.proposals.map((prop) => (
                          <div
                            key={prop.id}
                            className="p-4 border border-zinc-200 rounded-lg bg-zinc-50/50 space-y-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm text-zinc-900">
                                    {prop.freelancerName}
                                  </span>
                                  <span className="ui-badge bg-zinc-200/70 text-zinc-800">
                                    Evidence Score: {prop.freelancerEvidenceScore}/100
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => onInspectPassport(prop.freelancerDid)}
                                    className="text-xs text-zinc-600 underline cursor-pointer"
                                  >
                                    View credentials
                                  </button>
                                </div>
                                <div className="text-xs text-zinc-500 mt-0.5">
                                  {prop.freelancerHeadline}
                                </div>
                              </div>
                              <div className="text-right tabular-nums">
                                <div className="text-sm font-semibold text-zinc-900">
                                  {formatCurrency(prop.proposedCost, prop.currency)}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                  {prop.proposedDurationDays} days · By {prop.proposedDeadline}
                                </div>
                              </div>
                            </div>

                            <p className="text-xs text-zinc-700 leading-relaxed">
                              {prop.coverLetter}
                            </p>

                            <div className="flex justify-end">
                              {prop.status === 'ACCEPTED' ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenContract(prop.agreementId)}
                                  className="ui-btn-secondary text-xs"
                                >
                                  Open Digital Agreement
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busyPropId === prop.id}
                                  onClick={() => handleAcceptProposal(prop)}
                                  className="ui-btn-primary text-xs"
                                >
                                  {busyPropId === prop.id
                                    ? 'Creating Agreement...'
                                    : 'Hire & Sign Digital Agreement'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {applyModalGig && (
        <ApplyGigModal
          gig={applyModalGig}
          onClose={() => setApplyModalGig(null)}
          onSubmitted={async () => {
            setApplyModalGig(null);
            await onRefresh();
            showToast('Proposal submitted.');
          }}
          showToast={showToast}
        />
      )}

      {pendingHireSign && (
        <CryptoSignModal
          title="Sign Digital Agreement v1"
          subtitle={`Hiring ${pendingHireSign.proposal.freelancerName} — counterparty must also co-sign with their private key.`}
          termsHash={pendingHireSign.prep.termsHash}
          signingDigest={pendingHireSign.prep.signingDigest}
          signerUser={currentUser}
          onCancel={() => setPendingHireSign(null)}
          onSigned={async (signatureHex) => {
            const res = await apiFetch(
              `/api/proposals/${pendingHireSign.proposal.id}/accept`,
              {
                method: 'POST',
                body: JSON.stringify({
                  agreementIdOverride: pendingHireSign.prep.agreementId,
                  startDateOverride: pendingHireSign.prep.startDate,
                  signature: signatureHex,
                }),
              }
            );
            setPendingHireSign(null);
            await onRefresh();
            showToast(
              `Signed Digital Agreement v1 with your key and sent to ${pendingHireSign.proposal.freelancerName}.`
            );
            onOpenContract(res.agreementId);
          }}
        />
      )}
    </div>
  );
}

function ApplyGigModal({ gig, onClose, onSubmitted, showToast }) {
  const defaultPrice = Math.round((gig.budgetMin + gig.budgetMax) / 2);
  const [proposedCost, setProposedCost] = useState(defaultPrice);
  const [proposedDurationDays, setProposedDurationDays] = useState(gig.durationDays);
  const [proposedDeadline, setProposedDeadline] = useState(gig.deadline);
  const [coverLetter, setCoverLetter] = useState('');
  const [milestones, setMilestones] = useState([
    {
      title: 'Milestone 1: Initial Implementation',
      deliverables: 'Core modules and source repository',
      dueDate: gig.deadline,
      amount: Math.round(defaultPrice * 0.5),
    },
    {
      title: 'Milestone 2: Final Delivery & Verification',
      deliverables: 'Production build and test suite',
      dueDate: gig.deadline,
      amount: defaultPrice - Math.round(defaultPrice * 0.5),
    },
  ]);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/gigs/${gig.id}/proposals`, {
        method: 'POST',
        body: JSON.stringify({
          coverLetter,
          proposedCost: Number(proposedCost),
          currency: gig.currency,
          proposedDurationDays: Number(proposedDurationDays),
          proposedDeadline,
          proposedFeatures: gig.features,
          proposedMilestones: milestones,
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white border border-zinc-200 rounded-lg shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between border-b border-zinc-200 pb-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Submit Proposal</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{gig.title}</p>
          </div>
          <button type="button" onClick={onClose} className="ui-btn-secondary py-1 px-2.5 text-xs">
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-zinc-700 mb-1">
                Bid amount ({gig.currency})
              </label>
              <input
                type="number"
                required
                value={proposedCost}
                onChange={(e) => setProposedCost(e.target.value)}
                className="ui-input tabular-nums"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Duration (days)</label>
              <input
                type="number"
                required
                value={proposedDurationDays}
                onChange={(e) => setProposedDurationDays(e.target.value)}
                className="ui-input tabular-nums"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Target deadline</label>
              <input
                type="date"
                required
                value={proposedDeadline}
                onChange={(e) => setProposedDeadline(e.target.value)}
                className="ui-input font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-zinc-700 mb-1">Approach &amp; cover note</label>
            <textarea
              rows={3}
              required
              placeholder="Outline your implementation plan, relevant experience, and timeline..."
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              className="ui-input"
            />
          </div>

          <div className="border border-zinc-200 rounded-lg p-3.5 bg-zinc-50/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-800">Proposed Milestones</span>
              <button
                type="button"
                onClick={() =>
                  setMilestones([
                    ...milestones,
                    {
                      title: `Milestone ${milestones.length + 1}`,
                      deliverables: 'Deliverables',
                      dueDate: proposedDeadline,
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
              <div key={idx} className="grid grid-cols-3 gap-2">
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

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="ui-btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="ui-btn-primary">
              {busy ? 'Submitting...' : 'Submit proposal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
