import React from 'react';
import {
  ShieldCheck,
  FileSignature,
  CheckSquare,
  Award,
  SearchCheck,
  Network,
  UserPlus,
  Cpu,
  Bell,
} from 'lucide-react';
import { shortHex, tierMeta } from '../lib/wallet.js';

const NAV_ITEMS = [
  { id: 'dashboard', label: '01. Overview & Ledger', icon: Cpu },
  { id: 'agreements', label: '02. Digital Agreements', icon: FileSignature },
  { id: 'milestones', label: '03. Milestones & Proofs', icon: CheckSquare },
  { id: 'reputation', label: '04. Portable Reputation', icon: Award },
  { id: 'verifier', label: '05. 1-Sec Audit Verifier', icon: SearchCheck },
  { id: 'network', label: '06. DIDs & Fraud AI', icon: Network },
];

export default function Header({
  activeTab,
  setActiveTab,
  identities,
  activePersona,
  setActivePersonaDid,
  chainStatus,
  pendingActionCount,
  onOpenNewDidModal,
}) {
  return (
    <header className="border-b-2 border-[#111827] bg-[#FAF7F0] sticky top-0 z-30">
      {/* Slide 01-12 Signature Tricolor Top Strip */}
      <div className="grid grid-cols-3 h-2 w-full">
        <div className="bg-[#E11D48]" />
        <div className="bg-[#0284C7]" />
        <div className="bg-[#F59E0B]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="bg-[#111827] text-white px-3 py-1.5 border-2 border-[#111827] shadow-[3px_3px_0px_#E11D48] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#F59E0B]" />
              <span className="font-bold tracking-tight text-xl leading-none">
                TRUST<span className="text-[#E11D48] text-xs ml-0.5 font-extrabold">WORK</span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 bg-[#F59E0B] border border-[#111827]">
                  Verify the work. Trust the professional.
                </span>
                {chainStatus && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono bg-emerald-100 text-emerald-900 border border-[#111827] px-2 py-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                    EVM Block #{chainStatus.blockNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Decentralized Reputation, W3C Credentials &amp; Dual-Signed Blockchain Digital Agreements
              </p>
            </div>
          </div>

          {/* Active DID Persona Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="brutal-card-sm px-3 py-1.5 bg-white flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase font-bold text-slate-500">
                Signing Identity:
              </span>
              <select
                aria-label="Active Signing Identity"
                value={activePersona?.did || ''}
                onChange={(e) => setActivePersonaDid(e.target.value)}
                className="font-bold text-sm bg-transparent outline-none cursor-pointer pr-1"
              >
                {identities.map((id) => (
                  <option key={id.did} value={id.did}>
                    {id.name} ({id.role === 'CLIENT' ? 'Gig Provider' : 'Freelancer'} · {id.issuerTier})
                  </option>
                ))}
              </select>
              {activePersona && (
                <span
                  className={`hidden md:inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 border ${tierMeta(activePersona.issuerTier).bg}`}
                >
                  {shortHex(activePersona.did, 16, 4)}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenNewDidModal}
              className="brutal-btn bg-white hover:bg-amber-50 px-3 py-1.5 text-xs flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ New DID / Wallet</span>
            </button>
          </div>
        </div>

        {/* Navigation Bar */}
        <nav className="flex items-center gap-2 overflow-x-auto pt-3 pb-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const showBadge = item.id === 'agreements' && pendingActionCount > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`brutal-btn px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#111827] text-white shadow-[3px_3px_0px_#E11D48]'
                    : 'bg-white text-[#111827] hover:bg-amber-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
                {showBadge && (
                  <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-[#E11D48] text-white text-[10px] font-mono rounded-none">
                    <Bell className="w-2.5 h-2.5" />
                    {pendingActionCount}
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
