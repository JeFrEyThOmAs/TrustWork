import React, { useState } from 'react';
import {
  Plus,
  FileSignature,
  CheckCircle2,
  Clock,
  Award,
  ArrowRight,
  Briefcase,
  Send,
} from 'lucide-react';
import { apiFetch, formatCurrency, initials } from '../lib/wallet.js';

export default function MyGigsProposalsTab({
  gigs,
  proposals,
  currentUser,
  onOpenPostGig,
  onInspectPassport,
  onOpenContract,
  onRefresh,
  showToast,
}) {
  const [busyId, setBusyId] = useState(null);

  const myPostedGigs = gigs.filter((g) => g.posterDid === currentUser?.did);
  const mySentProposals = proposals.filter((p) => p.freelancerDid === currentUser?.did);

  async function handleAcceptProposal(proposal) {
    setBusyId(proposal.id);
    try {
      const res = await apiFetch(`/api/proposals/${proposal.id}/accept`, {
        method: 'POST',
        body: JSON.stringify({
          actorDid: currentUser.did,
        }),
      });
      await onRefresh();
      showToast(
        `Proposal accepted! Digital Agreement v1 signed by you — waiting for ${proposal.freelancerName} to co-sign so it locks on the blockchain.`
      );
      onOpenContract(res.agreementId);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="tw-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            My Posted Gigs &amp; Freelancer Proposals
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            On TrustWork, your single account lets you both hire talent as a Gig Provider and apply to gigs as a Freelancer.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenPostGig}
          className="tw-btn-primary px-4 py-2 text-xs sm:text-sm flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Post a New Gig</span>
        </button>
      </div>

      {/* SECTION 1: Gigs Posted by Current User */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-indigo-600" />
          <h2 className="text-base font-bold text-slate-900">
            Gigs I Posted as a Gig Provider ({myPostedGigs.length})
          </h2>
        </div>

        {myPostedGigs.length === 0 ? (
          <div className="tw-card p-6 text-xs text-slate-500 flex items-center justify-between">
            <span>You haven&apos;t posted any gigs from {currentUser?.name}&apos;s account yet.</span>
            <button
              type="button"
              onClick={onOpenPostGig}
              className="text-indigo-600 font-semibold hover:underline cursor-pointer"
            >
              + Post your first gig
            </button>
          </div>
        ) : (
          myPostedGigs.map((gig) => (
            <div key={gig.id} className="tw-card p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        gig.status === 'OPEN'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-indigo-50 text-indigo-700'
                      }`}
                    >
                      {gig.status}
                    </span>
                    <span className="text-xs text-slate-500">{gig.category}</span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900 mt-1">{gig.title}</h3>
                </div>
                <div className="text-sm font-bold text-slate-800">
                  Budget: {formatCurrency(gig.budgetMin, gig.currency)} –{' '}
                  {formatCurrency(gig.budgetMax, gig.currency)}
                </div>
              </div>

              {/* Incoming Proposals on this Gig */}
              {gig.proposals?.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No freelancer proposals yet. Switch to another account in the navbar to apply!
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Incoming Freelancer Proposals ({gig.proposals.length})
                  </div>
                  {gig.proposals.map((prop) => (
                    <div
                      key={prop.id}
                      className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            style={{ backgroundColor: prop.freelancerAvatarColor }}
                            className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center"
                          >
                            {initials(prop.freelancerName)}
                          </span>
                          <span className="font-bold text-sm text-slate-900">
                            {prop.freelancerName}
                          </span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                            Evidence Score: {prop.freelancerEvidenceScore}/100
                          </span>
                          <button
                            type="button"
                            onClick={() => onInspectPassport(prop.freelancerDid)}
                            className="text-xs text-indigo-600 font-medium hover:underline cursor-pointer"
                          >
                            Verify Past Work ➔
                          </button>
                        </div>
                        <p className="text-xs text-slate-600">{prop.coverLetter}</p>
                        <div className="text-xs text-slate-500">
                          Proposed Bid:{' '}
                          <strong className="text-slate-900">
                            {formatCurrency(prop.proposedCost, prop.currency)}
                          </strong>{' '}
                          · Delivery in <strong>{prop.proposedDurationDays} days</strong> (by{' '}
                          {prop.proposedDeadline}) · {prop.proposedMilestones.length} Milestones
                        </div>
                      </div>

                      <div className="shrink-0">
                        {prop.status === 'ACCEPTED' ? (
                          <button
                            type="button"
                            onClick={() => onOpenContract(prop.agreementId)}
                            className="tw-btn-secondary px-4 py-2 text-xs flex items-center gap-1.5"
                          >
                            <span>Open Digital Agreement</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === prop.id}
                            onClick={() => handleAcceptProposal(prop)}
                            className="tw-btn-primary px-4 py-2 text-xs flex items-center gap-1.5"
                          >
                            <FileSignature className="w-3.5 h-3.5" />
                            <span>
                              {busyId === prop.id
                                ? 'Signing Agreement...'
                                : 'Accept & Send Digital Agreement'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </section>

      {/* SECTION 2: Proposals Submitted by Current User as a Freelancer */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-emerald-600" />
          <h2 className="text-base font-bold text-slate-900">
            Proposals I Submitted as a Freelancer ({mySentProposals.length})
          </h2>
        </div>

        {mySentProposals.length === 0 ? (
          <div className="tw-card p-6 text-xs text-slate-500">
            You haven&apos;t submitted any proposals yet. Browse Find Work to apply to open gigs!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mySentProposals.map((p) => (
              <div key={p.id} className="tw-card p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        p.status === 'ACCEPTED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {p.status === 'ACCEPTED' ? 'Accepted — Contract Created' : 'Pending Review'}
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-900">
                      {formatCurrency(p.proposedCost, p.currency)}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 mt-2">{p.gigTitle}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.coverLetter}</p>
                </div>

                {p.agreementId && (
                  <button
                    type="button"
                    onClick={() => onOpenContract(p.agreementId)}
                    className="tw-btn-primary w-full py-2 text-xs flex items-center justify-center gap-1.5"
                  >
                    <FileSignature className="w-3.5 h-3.5" />
                    <span>Review &amp; Co-Sign Digital Agreement</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
