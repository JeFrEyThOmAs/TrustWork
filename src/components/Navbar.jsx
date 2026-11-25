import React from 'react';
import {
  Briefcase,
  Users,
  FolderKanban,
  FileSignature,
  Award,
  ShieldCheck,
  Plus,
  LogIn,
  ChevronDown,
} from 'lucide-react';
import { initials, shortHex } from '../lib/wallet.js';

const NAV_TABS = [
  { id: 'explore', label: 'Find Work', icon: Briefcase },
  { id: 'talent', label: 'Hire Talent', icon: Users },
  { id: 'my-gigs', label: 'My Gigs & Proposals', icon: FolderKanban },
  { id: 'contracts', label: 'Contracts & Agreements', icon: FileSignature },
  { id: 'reputation', label: 'My Passport & Credentials', icon: Award },
  { id: 'verify', label: 'Verify Proof', icon: ShieldCheck },
];

export default function Navbar({
  activeTab,
  setActiveTab,
  identities,
  currentUser,
  setCurrentUserDid,
  chainStatus,
  pendingContractActions,
  pendingProposalActions,
  onOpenPostGig,
  onOpenAuthModal,
}) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand */}
          <div
            onClick={() => setActiveTab('explore')}
            className="flex items-center gap-2.5 cursor-pointer shrink-0"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-extrabold text-lg shadow-sm">
              T
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-slate-900">
                  Trust<span className="text-indigo-600">Work</span>
                </span>
                {chainStatus && (
                  <span
                    title={`Smart Contract ${chainStatus.contractAddress}`}
                    className="hidden xl:inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    On-Chain #{chainStatus.blockNumber}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Actions: Post a Gig + Unified Account Switcher + Auth */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenPostGig}
              className="tw-btn-primary px-3.5 py-2 text-xs sm:text-sm flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Post a Gig</span>
            </button>

            {/* Quick Account Switcher + Current User */}
            {currentUser && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                <div
                  style={{ backgroundColor: currentUser.avatarColor || '#4F46E5' }}
                  className="w-7 h-7 rounded-lg text-white text-xs font-bold flex items-center justify-center shrink-0"
                >
                  {initials(currentUser.name)}
                </div>
                <div className="relative">
                  <select
                    aria-label="Switch active account"
                    value={currentUser.did}
                    onChange={(e) => setCurrentUserDid(e.target.value)}
                    className="appearance-none bg-transparent pr-5 text-xs sm:text-sm font-semibold text-slate-800 outline-none cursor-pointer max-w-[180px] truncate"
                  >
                    {identities.map((u) => (
                      <option key={u.did} value={u.did}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-0 top-1/2 -translate-y-1/2" />
                  <div className="text-[10px] font-mono text-slate-500 leading-none hidden sm:block">
                    {shortHex(currentUser.did, 16, 4)} · Freelancer &amp; Client
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onOpenAuthModal}
              className="tw-btn-secondary px-3 py-2 text-xs flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Sign Up / Log In</span>
            </button>
          </div>
        </div>

        {/* Sub-Navigation Bar */}
        <nav className="flex items-center gap-1 overflow-x-auto -mb-px">
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            const badgeCount =
              tab.id === 'contracts'
                ? pendingContractActions
                : tab.id === 'my-gigs'
                  ? pendingProposalActions
                  : 0;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap flex items-center gap-1.5 transition cursor-pointer ${
                  active
                    ? 'border-indigo-600 text-indigo-600 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {badgeCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
