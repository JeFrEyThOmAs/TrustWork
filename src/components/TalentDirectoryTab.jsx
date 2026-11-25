import React, { useMemo, useState } from 'react';
import {
  Search,
  MapPin,
  Award,
  FileSignature,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { formatCurrency, initials, shortHex, tierMeta } from '../lib/wallet.js';

export default function TalentDirectoryTab({
  identities,
  credentials,
  currentUser,
  onInspectPassport,
  onStartDirectAgreement,
}) {
  const [search, setSearch] = useState('');
  const [minScore, setMinScore] = useState(0);

  const filteredTalent = useMemo(() => {
    return identities
      .filter((person) => {
        if ((person.reputation?.evidenceScore ?? 0) < minScore) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const hay = `${person.name} ${person.headline} ${person.bio} ${person.skills.join(' ')} ${person.location}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort(
        (a, b) => (b.reputation?.evidenceScore ?? 0) - (a.reputation?.evidenceScore ?? 0)
      );
  }, [identities, search, minScore]);

  return (
    <div className="space-y-6">
      <div className="tw-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Discover Blockchain-Verified Freelancers &amp; Builders
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Every freelancer&apos;s Evidence Score is backed by dual-signed contracts, Git commit deliverables, and cryptographically signed W3C credentials.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by skill or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="tw-input pl-9 text-xs"
            />
          </div>
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="tw-input w-auto text-xs"
          >
            <option value={0}>All Evidence Scores</option>
            <option value={25}>Score 25+</option>
            <option value={50}>Score 50+ (Verified Pro)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredTalent.map((person) => {
          const personCreds = credentials.filter(
            (c) => c.subjectDid === person.did && !c.revoked
          );
          const isMe = person.did === currentUser?.did;
          const tMeta = tierMeta(person.issuerTier);

          return (
            <div key={person.did} className="tw-card tw-card-hover p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      style={{ backgroundColor: person.avatarColor }}
                      className="w-12 h-12 rounded-2xl text-white font-bold text-base flex items-center justify-center shrink-0"
                    >
                      {initials(person.name)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-base text-slate-900">{person.name}</h3>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${tMeta.badge}`}>
                          {tMeta.label}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-600 mt-0.5">{person.headline}</p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {person.location}
                        </span>
                        <span className="font-mono">{shortHex(person.did, 15, 4)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Evidence Score Pill */}
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 text-center shrink-0">
                    <div className="text-lg font-extrabold text-indigo-700 leading-none">
                      {person.reputation?.evidenceScore ?? 0}
                    </div>
                    <div className="text-[10px] font-semibold text-indigo-600 mt-0.5">
                      Evidence Score
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{person.bio}</p>

                <div className="flex flex-wrap gap-1.5">
                  {person.skills.map((s) => (
                    <span
                      key={s}
                      className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700"
                    >
                      {s}
                    </span>
                  ))}
                </div>

                {/* Highlight Verified Credentials if any */}
                {personCreds.length > 0 && (
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5 text-xs flex items-center justify-between">
                    <span className="text-emerald-800 font-medium flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        {personCreds.length} On-Chain Verified Credential(s) · Latest:{' '}
                        <strong>{personCreds[0].projectTitle}</strong>
                      </span>
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="text-sm font-bold text-slate-900">
                  {formatCurrency(person.hourlyRate, 'INR')}
                  <span className="text-xs font-normal text-slate-500"> / hr</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onInspectPassport(person.did)}
                    className="tw-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1"
                  >
                    <Award className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Verified Passport</span>
                  </button>
                  {!isMe && (
                    <button
                      type="button"
                      onClick={() => onStartDirectAgreement(person)}
                      className="tw-btn-primary px-3.5 py-1.5 text-xs flex items-center gap-1"
                    >
                      <FileSignature className="w-3.5 h-3.5" />
                      <span>Hire / Draft Agreement</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
