import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { formatCurrency, initials, shortHex, tierMeta } from '../lib/wallet.js';

export default function TalentDirectoryTab({
  identities,
  credentials,
  currentUser,
  onInspectPassport,
  onStartDirectAgreement,
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return identities
      .filter((person) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        const hay = `${person.name} ${person.headline} ${person.skills.join(' ')} ${person.organization}`.toLowerCase();
        return hay.includes(q);
      })
      .sort(
        (a, b) => (b.reputation?.evidenceScore ?? 0) - (a.reputation?.evidenceScore ?? 0)
      );
  }, [identities, search]);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="h-14 shrink-0 border-b border-zinc-200 px-6 flex items-center justify-between gap-4">
        <h1 className="text-sm font-semibold text-zinc-900">
          Professional Directory ({identities.length})
        </h1>
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter by name, skill, or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ui-input pl-8 py-1.5 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Skills</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Credentials</th>
                <th className="px-4 py-3">Evidence Score</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {filtered.map((person) => {
                const credsCount = credentials.filter(
                  (c) => c.subjectDid === person.did && !c.revoked
                ).length;
                const isMe = person.did === currentUser?.did;

                return (
                  <tr key={person.did} className="hover:bg-zinc-50/50">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          style={{ backgroundColor: person.avatarColor || '#18181B' }}
                          className="w-8 h-8 rounded text-white font-semibold text-xs flex items-center justify-center shrink-0"
                        >
                          {initials(person.name)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-900">{person.name}</span>
                            <span className={`ui-badge ${tierMeta(person.issuerTier).badge}`}>
                              {tierMeta(person.issuerTier).label}
                            </span>
                          </div>
                          <div className="text-zinc-500 mt-0.5">
                            {person.headline} · <span className="font-mono">{shortHex(person.did, 14, 4)}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {person.skills.slice(0, 4).map((s) => (
                          <span
                            key={s}
                            className="px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded text-[11px]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums font-medium text-zinc-900">
                      {formatCurrency(person.hourlyRate, 'INR')}/hr
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-zinc-700">
                      {credsCount} verified
                    </td>
                    <td className="px-4 py-3.5 tabular-nums">
                      <span className="font-semibold text-zinc-900">
                        {person.reputation?.evidenceScore ?? 0}
                      </span>
                      <span className="text-zinc-400"> / 100</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onInspectPassport(person.did)}
                          className="ui-btn-secondary py-1 px-2.5 text-xs"
                        >
                          Passport
                        </button>
                        {!isMe && (
                          <button
                            type="button"
                            onClick={() => onStartDirectAgreement(person)}
                            className="ui-btn-primary py-1 px-2.5 text-xs"
                          >
                            Draft Agreement
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
