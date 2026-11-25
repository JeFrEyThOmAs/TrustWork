import React from 'react';
import {
  Briefcase,
  Users,
  FolderKanban,
  FileSignature,
  Award,
  ShieldCheck,
  Plus,
  LogOut,
  KeyRound,
} from 'lucide-react';
import { initials, shortHex } from '../lib/wallet.js';

const ITEMS = [
  { id: 'explore', label: 'Browse Gigs', icon: Briefcase },
  { id: 'my-gigs', label: 'My Gigs & Bids', icon: FolderKanban },
  { id: 'contracts', label: 'Agreements', icon: FileSignature },
  { id: 'talent', label: 'Directory', icon: Users },
  { id: 'reputation', label: 'Credentials & DID', icon: Award },
  { id: 'verify', label: 'Verify Proof', icon: ShieldCheck },
];

export default function Sidebar({
  activeTab,
  setActiveTab,
  currentUser,
  chainStatus,
  pendingContractActions,
  pendingProposalActions,
  onOpenPostGig,
  onOpenKeypair,
  onLogout,
}) {
  return (
    <aside className="w-60 shrink-0 bg-[#FAFAFA] border-r border-zinc-200 flex flex-col justify-between select-none">
      <div className="p-4 space-y-5">
        {/* Brand */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-zinc-900 text-white text-xs font-bold flex items-center justify-center">
              T
            </div>
            <span className="font-semibold text-sm tracking-tight text-zinc-900">TrustWork</span>
          </div>
          {chainStatus && (
            <span
              title={`Contract: ${chainStatus.contractAddress}`}
              className="text-[11px] font-mono text-zinc-500"
            >
              #{chainStatus.blockNumber}
            </span>
          )}
        </div>

        {/* Primary Action */}
        <button
          type="button"
          onClick={onOpenPostGig}
          className="ui-btn-primary w-full flex items-center justify-center gap-1.5 py-2"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Post a Gig</span>
        </button>

        {/* Navigation */}
        <nav className="space-y-0.5">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            const count =
              item.id === 'contracts'
                ? pendingContractActions
                : item.id === 'my-gigs'
                  ? pendingProposalActions
                  : 0;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full px-2.5 py-2 rounded-md text-xs font-medium flex items-center justify-between transition cursor-pointer ${
                  active
                    ? 'bg-zinc-200/80 text-zinc-950 font-semibold'
                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 text-zinc-500" />
                  <span>{item.label}</span>
                </span>
                {count > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-zinc-900 text-white text-[10px] font-mono tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom User Account Footer */}
      {currentUser && (
        <div className="p-3 border-t border-zinc-200 space-y-2">
          <div className="flex items-center gap-2.5 px-1">
            <div
              style={{ backgroundColor: currentUser.avatarColor || '#18181B' }}
              className="w-7 h-7 rounded text-white text-xs font-semibold flex items-center justify-center shrink-0"
            >
              {initials(currentUser.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-zinc-900 truncate">{currentUser.name}</div>
              <div className="text-[11px] font-mono text-zinc-500 truncate">
                {shortHex(currentUser.did, 14, 4)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenKeypair}
            className="w-full px-2.5 py-1.5 rounded-md text-xs text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-100 flex items-center gap-2 transition cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-zinc-600" />
            <span>My Signing Keypair</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="w-full px-2.5 py-1.5 rounded-md text-xs text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 flex items-center gap-2 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </aside>
  );
}
