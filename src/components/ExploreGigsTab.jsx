import React, { useMemo, useState } from 'react';
import {
  Search,
  Clock,
  ShieldCheck,
  Send,
  Plus,
  CheckCircle2,
  Briefcase,
  Sparkles,
  Users,
} from 'lucide-react';
import { apiFetch, formatCurrency, initials, tierMeta } from '../lib/wallet.js';

export default function ExploreGigsTab({
  gigs,
  currentUser,
  pendingContractActions,
  onOpenPostGig,
  onNavigate,
  onRefresh,
  showToast,
}) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [applyGig, setApplyGig] = useState(null);

  const categories = useMemo(() => {
    const set = new Set(gigs.map((g) => g.category));
    return ['ALL', ...Array.from(set)];
  }, [gigs]);

  const filteredGigs = useMemo(() => {
    return gigs.filter((g) => {
      if (onlyOpen && g.status !== 'OPEN') return false;
      if (selectedCategory !== 'ALL' && g.category !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${g.title} ${g.description} ${g.posterName} ${g.skills.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [gigs, onlyOpen, selectedCategory, search]);

  return (
    <div className="space-y-6">
      {/* Action Alert if Current User Has a Contract Awaiting Co-Signature */}
      {pendingContractActions > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-amber-950">
                You have {pendingContractActions} Digital Agreement / Modification awaiting your signature
              </h3>
              <p className="text-xs text-amber-800 mt-0.5">
                Agreements and contract modifications only take effect on the blockchain once both parties review and co-sign.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('contracts')}
            className="tw-btn-primary px-4 py-2 text-xs shrink-0"
          >
            Review &amp; Co-Sign Contract
          </button>
        </div>
      )}

      {/* Marketplace Hero Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 shadow-sm">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-medium text-indigo-200 mb-3">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Freelance &amp; Hire with Tamper-Proof Blockchain Agreements</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Work with confidence. Own your verified reputation forever.
          </h1>
          <p className="text-sm text-slate-300 mt-2 leading-relaxed">
            Post gigs as a client or apply as a freelancer from one unified account. Every hired project is locked in a{' '}
            <strong className="text-white">Dual-Signed Blockchain Digital Agreement</strong> (any change to time, cost, or features requires mutual approval), and completed work mints portable{' '}
            <strong className="text-white">W3C Verifiable Credentials</strong>.
          </p>
          <div className="flex flex-wrap gap-3 mt-5">
            <button
              type="button"
              onClick={onOpenPostGig}
              className="bg-indigo-500 hover:bg-indigo-400 text-white font-semibold px-4 py-2.5 rounded-xl text-sm flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Post a New Gig</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('talent')}
              className="bg-white/10 hover:bg-white/15 text-white border border-white/20 font-semibold px-4 py-2.5 rounded-xl text-sm flex items-center gap-1.5 transition cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>Browse Verified Talent</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="tw-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search gigs by skill, title, or company (e.g. React, Rust, Figma, AI, Payments)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="tw-input pl-10"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={onlyOpen}
              onChange={(e) => setOnlyOpen(e.target.checked)}
              className="rounded text-indigo-600"
            />
            <span>Open Gigs Only</span>
          </label>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'ALL' ? 'All Categories' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Gig Listings */}
      <div className="space-y-4">
        {filteredGigs.length === 0 ? (
          <div className="tw-card p-10 text-center text-sm text-slate-500">
            No gigs match your current filter. Try clearing your search or post a new gig!
          </div>
        ) : (
          filteredGigs.map((gig) => {
            const isMyGig = gig.posterDid === currentUser?.did;
            const myExistingProposal = gig.proposals?.find(
              (p) => p.freelancerDid === currentUser?.did
            );
            const tMeta = tierMeta(gig.posterTier);

            return (
              <div key={gig.id} className="tw-card tw-card-hover p-5 sm:p-6">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-2.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                          gig.status === 'OPEN'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : gig.status === 'IN_CONTRACT'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {gig.status === 'OPEN'
                          ? 'Open for Proposals'
                          : gig.status === 'IN_CONTRACT'
                            ? 'Active Contract'
                            : 'Completed'}
                      </span>
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {gig.category}
                      </span>
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${tMeta.badge}`}>
                        ✓ {tMeta.label}
                      </span>
                    </div>

                    <h2 className="text-lg sm:text-xl font-bold text-slate-900">{gig.title}</h2>
                    <p className="text-sm text-slate-600 leading-relaxed">{gig.description}</p>

                    {/* Target Features */}
                    {gig.features?.length > 0 && (
                      <div className="pt-1">
                        <div className="text-xs font-semibold text-slate-500 mb-1.5">
                          Deliverable Features Requested:
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {gig.features.map((f, idx) => (
                            <div
                              key={idx}
                              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-start gap-2"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                              <div>
                                <div className="font-semibold text-slate-800">{f.name}</div>
                                {f.acceptanceCriteria && (
                                  <div className="text-[11px] text-slate-500">
                                    Criteria: {f.acceptanceCriteria}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Skills */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {gig.skills.map((skill) => (
                        <span
                          key={skill}
                          className="text-xs font-medium px-2.5 py-1 rounded-md bg-indigo-50/70 text-indigo-700 border border-indigo-100"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>

                    {/* Poster Footer */}
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <span
                          style={{ backgroundColor: gig.posterAvatarColor }}
                          className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                        >
                          {initials(gig.posterName)}
                        </span>
                        <span className="font-medium text-slate-700">
                          Posted by {gig.posterName}
                          {gig.posterOrganization ? ` · ${gig.posterOrganization}` : ''}
                        </span>
                      </div>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Est. {gig.durationDays} days (Target {gig.deadline})
                      </span>
                      <span>{gig.proposalCount} Proposal(s)</span>
                    </div>
                  </div>

                  {/* Right Price & Apply Column */}
                  <div className="lg:w-56 shrink-0 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Project Budget
                      </div>
                      <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                        {formatCurrency(gig.budgetMin, gig.currency)} –{' '}
                        {formatCurrency(gig.budgetMax, gig.currency)}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {gig.experienceLevel} Level
                      </div>
                    </div>

                    {gig.status === 'OPEN' ? (
                      isMyGig ? (
                        <button
                          type="button"
                          onClick={() => onNavigate('my-gigs')}
                          className="tw-btn-secondary w-full py-2 text-xs"
                        >
                          Manage Proposals ({gig.proposalCount})
                        </button>
                      ) : myExistingProposal ? (
                        <button
                          type="button"
                          onClick={() => onNavigate('my-gigs')}
                          className="w-full py-2 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer"
                        >
                          ✓ Proposal Sent ({formatCurrency(myExistingProposal.proposedCost, myExistingProposal.currency)})
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setApplyGig(gig)}
                          className="tw-btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Submit Proposal</span>
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => onNavigate('contracts')}
                        className="tw-btn-secondary w-full py-2 text-xs"
                      >
                        View Contract Workspace
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Submit Proposal Modal */}
      {applyGig && (
        <SubmitProposalModal
          gig={applyGig}
          currentUser={currentUser}
          onClose={() => setApplyGig(null)}
          onSubmitted={async () => {
            setApplyGig(null);
            await onRefresh();
            showToast(
              `Proposal submitted to ${applyGig.posterName}! Once accepted, you'll both co-sign the blockchain Digital Agreement.`
            );
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function SubmitProposalModal({ gig, currentUser, onClose, onSubmitted, showToast }) {
  const defaultBid = Math.round((gig.budgetMin + gig.budgetMax) / 2);
  const [proposedCost, setProposedCost] = useState(defaultBid);
  const [proposedDurationDays, setProposedDurationDays] = useState(gig.durationDays);
  const [proposedDeadline, setProposedDeadline] = useState(gig.deadline);
  const [coverLetter, setCoverLetter] = useState(
    `Hi ${gig.posterName.split(' ')[0]}, I'd love to build "${gig.title}". You can verify my past completed deliverables and cryptographic credentials directly on my TrustWork profile.`
  );
  const [milestones, setMilestones] = useState([
    {
      title: 'Milestone 1: Core Architecture & Initial Deliverable',
      deliverables: 'Core modules + repository setup + unit tests',
      dueDate: gig.deadline,
      amount: Math.round(defaultBid * 0.5),
    },
    {
      title: 'Milestone 2: Complete Feature Set & Final Handover',
      deliverables: 'Full production build + documentation',
      dueDate: gig.deadline,
      amount: defaultBid - Math.round(defaultBid * 0.5),
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
          freelancerDid: currentUser.did,
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
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="tw-card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between border-b border-slate-200 pb-3">
          <div>
            <span className="text-xs font-semibold text-indigo-600">Apply as Freelancer</span>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5">{gig.title}</h3>
            <p className="text-xs text-slate-500">
              Applying as <strong>{currentUser?.name}</strong> (Evidence Score:{' '}
              {currentUser?.reputation?.evidenceScore}/100)
            </p>
          </div>
          <button type="button" onClick={onClose} className="tw-btn-secondary px-3 py-1.5 text-xs">
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Your Bid ({gig.currency})
              </label>
              <input
                type="number"
                required
                value={proposedCost}
                onChange={(e) => setProposedCost(e.target.value)}
                className="tw-input font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Delivery Time (Days)
              </label>
              <input
                type="number"
                required
                value={proposedDurationDays}
                onChange={(e) => setProposedDurationDays(e.target.value)}
                className="tw-input font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Proposed Deadline
              </label>
              <input
                type="date"
                required
                value={proposedDeadline}
                onChange={(e) => setProposedDeadline(e.target.value)}
                className="tw-input font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Cover Pitch &amp; Execution Plan
            </label>
            <textarea
              rows={3}
              required
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              className="tw-input"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                Proposed Milestone Breakdown (Used to pre-fill the Digital Agreement)
              </span>
              <button
                type="button"
                onClick={() =>
                  setMilestones([
                    ...milestones,
                    {
                      title: `Milestone ${milestones.length + 1}`,
                      deliverables: 'Deliverable package',
                      dueDate: proposedDeadline,
                      amount: 50000,
                    },
                  ])
                }
                className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
              >
                + Add Stage
              </button>
            </div>
            {milestones.map((m, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                  placeholder="Milestone title"
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
                  type="number"
                  required
                  value={m.amount}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[idx] = { ...next[idx], amount: Number(e.target.value) };
                    setMilestones(next);
                  }}
                  className="tw-input text-xs font-mono"
                  placeholder="Amount"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="tw-btn-secondary px-4 py-2 text-xs">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="tw-btn-primary px-5 py-2 text-xs">
              {busy ? 'Sending Proposal...' : 'Send Proposal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
