import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { apiFetch, formatCurrency } from '../lib/wallet.js';
import { CryptoSignModal } from './CryptoSignModal.jsx';

export default function MyGigsProposalsTab({
  gigs,
  myProposals,
  currentUser,
  onOpenPostGig,
  onInspectPassport,
  onOpenContract,
  onRefresh,
  showToast,
}) {
  const [section, setSection] = useState('posted');
  const [busyId, setBusyId] = useState(null);
  const [pendingHireSign, setPendingHireSign] = useState(null);

  const myPostedGigs = gigs.filter((g) => g.posterDid === currentUser?.did);

  async function handleAcceptProposal(proposal) {
    setBusyId(proposal.id);
    try {
      const prep = await apiFetch(`/api/proposals/${proposal.id}/prepare-accept`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setPendingHireSign({ proposal, prep });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header Bar */}
      <div className="h-14 shrink-0 border-b border-zinc-200 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-zinc-900">My Gigs &amp; Bids</h1>
          <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-md text-xs">
            <button
              type="button"
              onClick={() => setSection('posted')}
              className={`px-3 py-1 rounded transition cursor-pointer ${
                section === 'posted'
                  ? 'bg-white text-zinc-900 font-medium shadow-2xs'
                  : 'text-zinc-600'
              }`}
            >
              Gigs I Posted ({myPostedGigs.length})
            </button>
            <button
              type="button"
              onClick={() => setSection('bids')}
              className={`px-3 py-1 rounded transition cursor-pointer ${
                section === 'bids'
                  ? 'bg-white text-zinc-900 font-medium shadow-2xs'
                  : 'text-zinc-600'
              }`}
            >
              Proposals I Sent ({myProposals.length})
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenPostGig}
          className="ui-btn-primary flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Post a Gig</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-8">
        {section === 'posted' ? (
          myPostedGigs.length === 0 ? (
            <div className="border border-dashed border-zinc-300 rounded-lg p-10 text-center space-y-2">
              <div className="text-sm font-medium text-zinc-900">You have not posted any gigs</div>
              <p className="text-xs text-zinc-500">
                Create a gig to receive proposals from freelancers and initiate a blockchain agreement.
              </p>
              <div className="pt-2">
                <button type="button" onClick={onOpenPostGig} className="ui-btn-primary">
                  Post a Gig
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {myPostedGigs.map((gig) => (
                <div key={gig.id} className="border border-zinc-200 rounded-lg overflow-hidden">
                  <div className="px-5 py-4 bg-zinc-50/70 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-zinc-900">{gig.title}</span>
                        <span className="ui-badge bg-white border-zinc-200 text-zinc-700">
                          {gig.status}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {gig.category} · Deadline {gig.deadline}
                      </div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-zinc-900">
                      {formatCurrency(gig.budgetMin, gig.currency)} –{' '}
                      {formatCurrency(gig.budgetMax, gig.currency)}
                    </div>
                  </div>

                  <div className="divide-y divide-zinc-200">
                    {gig.proposals?.length === 0 ? (
                      <div className="p-5 text-xs text-zinc-500">
                        No proposals received yet. When a freelancer applies from another session, their bid will appear here automatically.
                      </div>
                    ) : (
                      gig.proposals.map((prop) => (
                        <div
                          key={prop.id}
                          className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                        >
                          <div className="space-y-1 flex-1">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="font-semibold text-sm text-zinc-900">
                                {prop.freelancerName}
                              </span>
                              <span className="ui-badge bg-zinc-100 text-zinc-800 border-zinc-200">
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
                            <p className="text-xs text-zinc-600">{prop.coverLetter}</p>
                            <div className="text-xs text-zinc-500 tabular-nums pt-0.5">
                              Bid: <strong className="text-zinc-900">{formatCurrency(prop.proposedCost, prop.currency)}</strong> · {prop.proposedDurationDays} days · Target {prop.proposedDeadline}
                            </div>
                          </div>

                          <div className="shrink-0">
                            {prop.status === 'ACCEPTED' ? (
                              <button
                                type="button"
                                onClick={() => onOpenContract(prop.agreementId)}
                                className="ui-btn-secondary"
                              >
                                View Agreement
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busyId === prop.id}
                                onClick={() => handleAcceptProposal(prop)}
                                className="ui-btn-primary"
                              >
                                {busyId === prop.id
                                  ? 'Signing...'
                                  : 'Accept & Send Digital Agreement'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : myProposals.length === 0 ? (
          <div className="border border-dashed border-zinc-300 rounded-lg p-10 text-center text-xs text-zinc-500">
            You have not submitted any proposals yet. Open Browse Gigs to apply to open projects.
          </div>
        ) : (
          <div className="border border-zinc-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium">
                <tr>
                  <th className="px-4 py-3">Gig</th>
                  <th className="px-4 py-3">Bid</th>
                  <th className="px-4 py-3">Timeline</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {myProposals.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50/50">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-zinc-900">{p.gigTitle}</div>
                      <div className="text-zinc-500 line-clamp-1 mt-0.5">{p.coverLetter}</div>
                    </td>
                    <td className="px-4 py-3.5 font-semibold tabular-nums text-zinc-900">
                      {formatCurrency(p.proposedCost, p.currency)}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-zinc-600">
                      {p.proposedDurationDays} days ({p.proposedDeadline})
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`ui-badge ${
                          p.status === 'ACCEPTED'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {p.agreementId ? (
                        <button
                          type="button"
                          onClick={() => onOpenContract(p.agreementId)}
                          className="ui-btn-primary py-1.5 px-3 text-xs"
                        >
                          Review &amp; Co-Sign Agreement
                        </button>
                      ) : (
                        <span className="text-zinc-400">Awaiting client</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingHireSign && (
        <CryptoSignModal
          title="Sign Digital Agreement v1"
          subtitle={`Hiring ${pendingHireSign.proposal.freelancerName} — requires your Private Signing Key.`}
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
              `Signed Digital Agreement v1 and sent to ${pendingHireSign.proposal.freelancerName}.`
            );
            onOpenContract(res.agreementId);
          }}
        />
      )}
    </div>
  );
}
