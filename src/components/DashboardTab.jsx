import React, { useState } from 'react';
import {
  Shield,
  FileSignature,
  Database,
  Cpu,
  ArrowRight,
  Lock,
  CheckCircle2,
  Eye,
  ExternalLink,
  Layers,
  Sparkles,
} from 'lucide-react';
import { apiFetch, formatCurrency, shortHex } from '../lib/wallet.js';

export default function DashboardTab({
  data,
  activePersona,
  onNavigate,
  onSelectAgreement,
}) {
  const [ipfsModal, setIpfsModal] = useState(null);
  const [loadingCid, setLoadingCid] = useState(false);

  const {
    chainStatus,
    agreements = [],
    credentials = [],
    identities = [],
    recentTransactions = [],
    smartDataSeparation,
  } = data;

  const anchoredAgreements = agreements.filter(
    (a) => a.status === 'ACTIVE' || a.status === 'COMPLETED' || a.status === 'SUPERSEDED'
  );
  const pendingForPersona = agreements.filter(
    (a) =>
      (a.status === 'PENDING_SIGNATURES' || a.status === 'AMENDMENT_PENDING') &&
      (a.clientDid === activePersona?.did || a.freelancerDid === activePersona?.did) &&
      a.proposedByDid !== activePersona?.did
  );

  async function inspectCid(cid) {
    if (!cid) return;
    setLoadingCid(true);
    try {
      const env = await apiFetch(`/api/ipfs/${cid}`);
      setIpfsModal(env);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingCid(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Action Needed Callout for Current Persona */}
      {pendingForPersona.length > 0 && (
        <div className="brutal-card bg-[#FEF3C7] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-l-8 border-l-[#E11D48]">
          <div>
            <span className="text-xs font-mono font-bold uppercase bg-[#E11D48] text-white px-2 py-0.5">
              Counterparty Signature Required ({pendingForPersona.length})
            </span>
            <h3 className="font-bold text-base mt-1">
              {activePersona?.name}, you have {pendingForPersona.length} Digital Agreement / Mutual Amendment proposal(s) awaiting your cryptographic signature.
            </h3>
            <p className="text-xs text-slate-700">
              Remember: No agreement or modification takes effect on-chain until BOTH parties sign the identical Keccak-256 hash.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelectAgreement(pendingForPersona[0].id);
              onNavigate('agreements');
            }}
            className="brutal-btn bg-[#111827] text-white px-4 py-2 text-xs whitespace-nowrap flex items-center gap-1.5"
          >
            <span>Review &amp; Co-Sign Now</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Hero + Live EVM Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 brutal-card p-6 bg-white relative overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 bg-[#E11D48] text-white border border-[#111827]">
              CONSENSUS 2026 // DLT-REP-v2.0
            </span>
            <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 bg-sky-100 text-sky-900 border border-[#111827]">
              W3C DID + Verifiable Credentials + EVM
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">
            Portable, Evidence-Backed Reputation &amp; Tamper-Proof Digital Agreements
          </h1>
          <p className="text-sm text-slate-700 mt-2 leading-relaxed">
            TrustWork replaces platform-locked star ratings and mutable PDFs with{' '}
            <strong>Self-Controlled DIDs</strong>, <strong>Dual-Signed Blockchain Agreements</strong>{' '}
            (where any change to time, cost, or features requires mutual co-signing to mint a new version),
            and <strong>1-Second Auditable W3C Credentials</strong>.
          </p>

          <div className="flex flex-wrap gap-3 mt-5">
            <button
              type="button"
              onClick={() => onNavigate('agreements')}
              className="brutal-btn bg-[#F59E0B] text-[#111827] px-4 py-2 text-sm flex items-center gap-2"
            >
              <FileSignature className="w-4 h-4" />
              <span>Digital Agreements &amp; Amendments</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('verifier')}
              className="brutal-btn bg-white text-[#111827] px-4 py-2 text-sm flex items-center gap-2"
            >
              <Shield className="w-4 h-4 text-[#059669]" />
              <span>1-Second Independent Audit</span>
            </button>
          </div>
        </div>

        {/* Live Blockchain Contract Telemetry */}
        <div className="lg:col-span-5 brutal-dark p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase text-[#F59E0B] font-bold flex items-center gap-1.5">
                <Cpu className="w-4 h-4" />
                On-Chain EVM Registry Live
              </span>
              <span className="text-xs font-mono px-2 py-0.5 bg-emerald-900/70 text-emerald-300 border border-emerald-500">
                Chain ID {chainStatus?.chainId}
              </span>
            </div>

            <div className="mt-3 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between border-b border-slate-700 pb-1">
                <span className="text-slate-400">Smart Contract:</span>
                <span className="text-sky-300">{shortHex(chainStatus?.contractAddress, 12, 8)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-700 pb-1">
                <span className="text-slate-400">Solidity Compiler:</span>
                <span className="text-slate-200">v{chainStatus?.compilerVersion?.split('+')[0]}</span>
              </div>
              <div className="flex justify-between border-b border-slate-700 pb-1">
                <span className="text-slate-400">Signature Verification:</span>
                <span className="text-emerald-300">secp256k1 ecrecover (Dual-Party)</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-700">
            <div className="bg-slate-800/90 p-2.5 border border-slate-600">
              <div className="text-xl font-bold font-mono text-white">{identities.length}</div>
              <div className="text-[11px] text-slate-300">Registered DIDs</div>
            </div>
            <div className="bg-slate-800/90 p-2.5 border border-slate-600">
              <div className="text-xl font-bold font-mono text-[#F59E0B]">
                {anchoredAgreements.length}
              </div>
              <div className="text-[11px] text-slate-300">On-Chain Contracts</div>
            </div>
            <div className="bg-slate-800/90 p-2.5 border border-slate-600">
              <div className="text-xl font-bold font-mono text-emerald-400">
                {credentials.length}
              </div>
              <div className="text-[11px] text-slate-300">W3C Credentials</div>
            </div>
          </div>
        </div>
      </div>

      {/* Slide 04 & 07: The 4-Step TrustWork Evidence-Backed Pipeline */}
      <div className="brutal-card p-5 bg-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-[11px] font-mono font-bold uppercase px-2 py-0.5 bg-emerald-100 text-emerald-900 border border-[#111827]">
              TRUSTWORK LIFECYCLE PIPELINE
            </span>
            <h2 className="text-lg font-bold mt-1">
              From &ldquo;I Claim&rdquo; to &ldquo;Cryptographically Proven&rdquo;
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            {
              step: 'STEP 01',
              badge: 'DUAL-SIGNED',
              color: 'border-t-4 border-t-[#0284C7]',
              title: 'Digital Agreement',
              desc: 'Freelancer & Gig Provider agree on timeline, cost, features & milestones. Anchored on-chain only when BOTH sign. Modifications require mutual signatures to mint v2.',
              tab: 'agreements',
            },
            {
              step: 'STEP 02',
              badge: 'IPFS + COMMIT',
              color: 'border-t-4 border-t-[#F59E0B]',
              title: 'Evidence Submission',
              desc: 'Freelancer delivers source code commit hashes, artifacts & specs pinned to content-addressed IPFS storage and signed with their DID key.',
              tab: 'milestones',
            },
            {
              step: 'STEP 03',
              badge: 'ISSUER KEY',
              color: 'border-t-4 border-t-[#E11D48]',
              title: 'Client Sign-Off & W3C VC',
              desc: 'Gig Provider cryptographically co-signs milestone completion and issues a machine-readable W3C Verifiable Credential.',
              tab: 'reputation',
            },
            {
              step: 'STEP 04',
              badge: 'TAMPER-PROOF',
              color: 'border-t-4 border-t-[#059669]',
              title: '1-Second Audit Anywhere',
              desc: 'Any future client verifies issuer tier, timestamp, modification integrity (Keccak-256), and revocation status in under 1 second.',
              tab: 'verifier',
            },
          ].map((item) => (
            <div
              key={item.step}
              onClick={() => onNavigate(item.tab)}
              className={`brutal-card-sm p-4 bg-[#FAF7F0] hover:bg-white cursor-pointer transition ${item.color}`}
            >
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span className="text-slate-600">{item.step}</span>
                <span className="px-1.5 py-0.5 bg-white border border-[#111827] text-[10px]">
                  [{item.badge}]
                </span>
              </div>
              <h3 className="font-bold text-base mt-2">{item.title}</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Slide 10: Smart Data Separation Live Architecture */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="brutal-card p-5 bg-white border-t-4 border-t-[#0284C7]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase text-[#0284C7] flex items-center gap-1.5">
              <Database className="w-4 h-4" />
              OFF-CHAIN STORAGE (SQLite + IPFS Vault)
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 bg-sky-100 border border-[#111827] font-bold">
              FAST &amp; GDPR PRIVATE
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-2">
            Heavy contract clauses, personal bios, feature specifications, and deliverable artifacts stay off-chain ({smartDataSeparation?.offChainPayloadBytes?.toLocaleString()} bytes stored).
          </p>
          <div className="mt-3 space-y-2">
            {agreements.slice(0, 3).map((ag) => (
              <div
                key={ag.id}
                className="p-2.5 bg-[#FAF7F0] border border-[#111827] flex items-center justify-between gap-2 text-xs"
              >
                <div className="truncate">
                  <div className="font-bold truncate">
                    {ag.title} <span className="font-mono text-[11px]">(v{ag.version})</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-600">
                    IPFS CID: {shortHex(ag.ipfsCid, 16, 8)} · {formatCurrency(ag.totalCost, ag.currency)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={loadingCid}
                  onClick={() => inspectCid(ag.ipfsCid)}
                  className="brutal-btn bg-white px-2.5 py-1 text-[11px] flex items-center gap-1 shrink-0"
                >
                  <Eye className="w-3 h-3" />
                  <span>Inspect CID</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="brutal-card p-5 bg-[#0F172A] text-white border-t-4 border-t-[#059669]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase text-emerald-400 flex items-center gap-1.5">
              <Lock className="w-4 h-4" />
              ON-CHAIN BLOCKCHAIN (TrustWorkProtocol.sol)
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-500 font-bold">
              {smartDataSeparation?.compressionRatio}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-2">
            Only 32-byte Keccak-256 fingerprints, DIDs, dual ECDSA signature hashes, version pointers, and revocation booleans are anchored on-chain ({smartDataSeparation?.onChainFingerprintBytes} bytes).
          </p>
          <div className="mt-3 space-y-2 max-h-52 overflow-y-auto pr-1">
            {recentTransactions.slice(0, 6).map((tx) => (
              <div
                key={tx.tx_hash}
                className="p-2.5 bg-slate-900 border border-slate-700 text-xs font-mono"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#F59E0B] font-bold">
                    Block #{tx.block_number} · {tx.method}()
                  </span>
                  <span className="text-emerald-400">{tx.gas_used.toLocaleString()} gas</span>
                </div>
                <div className="text-slate-200 font-sans text-xs mt-0.5">{tx.summary}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Tx: {tx.tx_hash}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* IPFS CID Content-Addressed Vault Inspector Modal */}
      {ipfsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="brutal-card bg-white max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="p-4 border-b-2 border-[#111827] bg-[#FAF7F0] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase bg-[#0284C7] text-white px-2 py-0.5 font-bold">
                  OFF-CHAIN IPFS CONTENT-ADDRESSED OBJECT
                </span>
                <h3 className="font-bold font-mono text-xs sm:text-sm mt-1 break-all">
                  {ipfsModal.cid}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIpfsModal(null)}
                className="brutal-btn bg-white px-3 py-1 text-xs"
              >
                Close
              </button>
            </div>
            <div className="p-4 overflow-y-auto text-xs font-mono bg-slate-950 text-emerald-300">
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(ipfsModal, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
