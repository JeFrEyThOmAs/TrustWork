import React from 'react';
import { ShieldCheck, Network, Building2, UserPlus, Check, X } from 'lucide-react';
import { apiFetch, shortHex, tierMeta } from '../lib/wallet.js';

export default function NetworkTab({
  identities,
  trustGraph,
  onOpenNewDidModal,
  onRefresh,
  showToast,
}) {
  async function handleTierChange(did, newTier) {
    try {
      const res = await apiFetch(`/api/identities/${encodeURIComponent(did)}/tier`, {
        method: 'POST',
        body: JSON.stringify({ issuerTier: newTier }),
      });
      showToast(`Updated Issuer Tier to ${newTier} at Block #${res.receipt.blockNumber}`);
      await onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <div className="space-y-6">
      {/* Multi-Tier Verified Issuer & DID Registry */}
      <div className="brutal-card p-5 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 bg-[#0284C7] text-white border border-[#111827]">
              SLIDE 05, 06 &amp; 08 · MULTI-TIER VERIFIED ISSUER REGISTRY
            </span>
            <h2 className="text-xl font-bold mt-1">
              Decentralized Identifiers (DIDs) &amp; Organization Credibility Tiers
            </h2>
            <p className="text-xs text-slate-600">
              Prevents fake reviews by distinguishing verified Enterprises &amp; KYB Organizations from anonymous Individual accounts on-chain.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenNewDidModal}
            className="brutal-btn bg-[#F59E0B] text-[#111827] px-4 py-2 text-xs flex items-center gap-1.5 shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register Self-Controlled DID</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {identities.map((id) => (
            <div key={id.did} className="p-4 bg-[#FAF7F0] border-2 border-[#111827] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-base">{id.name}</span>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 border ${tierMeta(id.issuerTier).bg}`}
                >
                  {tierMeta(id.issuerTier).label}
                </span>
              </div>
              <div className="font-mono text-xs text-slate-700 break-all">{id.did}</div>
              <div className="text-xs text-slate-600">
                {id.organization || id.headline} {id.domain ? `· ${id.domain}` : ''}
              </div>
              <div className="pt-2 border-t border-slate-300 flex items-center justify-between text-xs">
                <span className="font-mono text-[11px] text-slate-600">
                  Role: <strong>{id.role}</strong> · Block #{id.blockNumber}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono">Registry Tier:</span>
                  <select
                    value={id.issuerTier}
                    onChange={(e) => handleTierChange(id.did, e.target.value)}
                    className="border border-[#111827] bg-white px-2 py-0.5 text-[11px] font-mono font-bold"
                  >
                    <option value="INDIVIDUAL">INDIVIDUAL</option>
                    <option value="VERIFIED_ORG">VERIFIED_ORG</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Slide 11: AI / Graph Fraud & Sybil Collusion Detection */}
      <div className="brutal-card p-5 bg-white border-t-4 border-t-[#E11D48]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase bg-[#E11D48] text-white px-2 py-0.5">
              SLIDE 11 · GRAPH COLLUSION &amp; RATING INFLATION MONITOR
            </span>
            <h3 className="font-bold text-lg mt-1">
              Bipartite Credential Graph &amp; Anti-Sybil Ring Diagnostics
            </h3>
          </div>
          <span className="text-xs font-mono font-bold px-3 py-1 bg-emerald-100 text-emerald-950 border border-[#111827]">
            {trustGraph?.networkHealth}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 bg-[#FAF7F0] border border-[#111827]">
            <div className="text-slate-500">DID GRAPH NODES</div>
            <div className="text-xl font-bold mt-1">{trustGraph?.totalNodes}</div>
          </div>
          <div className="p-3 bg-[#FAF7F0] border border-[#111827]">
            <div className="text-slate-500">CREDENTIAL EDGES</div>
            <div className="text-xl font-bold mt-1">{trustGraph?.totalCredentialEdges}</div>
          </div>
          <div className="p-3 bg-[#FAF7F0] border border-[#111827]">
            <div className="text-slate-500">DUAL-SIGNED CONTRACTS</div>
            <div className="text-xl font-bold mt-1">{trustGraph?.totalAnchoredAgreements}</div>
          </div>
          <div className="p-3 bg-[#FAF7F0] border border-[#111827]">
            <div className="text-slate-500">COLLUSION 2-CYCLES</div>
            <div className="text-xl font-bold mt-1 text-emerald-700">
              {trustGraph?.bidirectionalRings?.length || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Slide 08: Comparative Matrix */}
      <div className="brutal-card p-5 bg-white overflow-x-auto">
        <span className="text-[10px] font-mono font-bold uppercase bg-slate-900 text-white px-2 py-0.5">
          SLIDE 08 · COMPARATIVE ARCHITECTURE MATRIX
        </span>
        <h3 className="font-bold text-lg mt-1 mb-3">
          Why TrustWork Is an Open Protocol Layer — Not Another Walled Garden
        </h3>
        <table className="w-full text-xs border-collapse border-2 border-[#111827]">
          <thead>
            <tr className="bg-[#111827] text-white font-mono text-left">
              <th className="p-2.5 border border-slate-700">FEATURE DIMENSION</th>
              <th className="p-2.5 border border-slate-700">UPWORK / FIVERR</th>
              <th className="p-2.5 border border-slate-700 bg-[#E11D48]">TRUSTWORK PROTOCOL</th>
            </tr>
          </thead>
          <tbody>
            {[
              [
                'Freelancer Profiles & Identity',
                'Centralized SQL DB locked to platform',
                '✓ Self-Controlled W3C DID (did:trustwork:0x...)',
              ],
              [
                'Digital Agreements & Scope Changes',
                'Platform-controlled terms; unilateral disputes',
                '✓ Dual-Signed On-Chain State Engine; changes require BOTH signatures to mint v2+',
              ],
              [
                'Ratings & Work Proofs',
                'Subjective star reviews without code proof',
                '✓ Commit Hashes + IPFS Artifacts + Client ECDSA Sign-Off',
              ],
              [
                'Issuer Transparency',
                'Opaque buyer accounts',
                '✓ Multi-Tier Verified Issuer Registry (Enterprise / Verified Org)',
              ],
              [
                'Portable Professional Reputation',
                '✗ Resets to zero when leaving site',
                '✓ Globally Portable W3C JSON-LD + QR Wallet + 1-Sec Audit',
              ],
            ].map(([dim, legacy, tw]) => (
              <tr key={dim} className="border-t border-[#111827]">
                <td className="p-2.5 font-bold bg-[#FAF7F0] border-r border-[#111827]">{dim}</td>
                <td className="p-2.5 text-slate-600 border-r border-[#111827]">{legacy}</td>
                <td className="p-2.5 font-bold text-emerald-900 bg-emerald-50/50">{tw}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
