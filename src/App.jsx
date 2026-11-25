import React, { useEffect, useMemo, useState } from 'react';
import Header from './components/Header.jsx';
import DashboardTab from './components/DashboardTab.jsx';
import AgreementsTab from './components/AgreementsTab.jsx';
import MilestonesTab from './components/MilestonesTab.jsx';
import ReputationTab from './components/ReputationTab.jsx';
import VerifierTab from './components/VerifierTab.jsx';
import NetworkTab from './components/NetworkTab.jsx';
import { apiFetch, connectBrowserWallet } from './lib/wallet.js';

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activePersonaDid, setActivePersonaDid] = useState('');
  const [selectedAgreementId, setSelectedAgreementId] = useState(null);
  const [presetAudit, setPresetAudit] = useState(null);
  const [newDidModal, setNewDidModal] = useState(false);
  const [toast, setToast] = useState(null);

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 5500);
  }

  async function refreshBootstrap() {
    try {
      const res = await apiFetch('/api/bootstrap');
      setData(res);
      if (!activePersonaDid && res.identities?.length > 0) {
        setActivePersonaDid(res.identities[0].did);
      }
      if (!selectedAgreementId && res.agreements?.length > 0) {
        setSelectedAgreementId(res.agreements[0].id);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshBootstrap();
  }, []);

  const activePersona = useMemo(() => {
    if (!data?.identities) return null;
    return (
      data.identities.find((i) => i.did === activePersonaDid) || data.identities[0] || null
    );
  }, [data, activePersonaDid]);

  const pendingActionCount = useMemo(() => {
    if (!data?.agreements || !activePersona) return 0;
    return data.agreements.filter(
      (a) =>
        (a.status === 'PENDING_SIGNATURES' || a.status === 'AMENDMENT_PENDING') &&
        ((a.clientDid === activePersona.did && !a.clientSignature) ||
          (a.freelancerDid === activePersona.did && !a.freelancerSignature))
    ).length;
  }, [data, activePersona]);

  function handleOpenAudit(mode, targetId, payload) {
    setPresetAudit({ mode, targetId, payload });
    setActiveTab('verifier');
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F0]">
        <div className="brutal-card p-6 bg-white text-center space-y-2">
          <div className="font-mono font-bold text-sm uppercase bg-[#111827] text-[#F59E0B] px-3 py-1 inline-block">
            BOOTING TRUSTWORK CONSENSUS EVM...
          </div>
          <p className="text-xs text-slate-600">
            Compiling Solidity Registry &amp; Syncing Verifiable Credentials
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F0]">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        identities={data.identities}
        activePersona={activePersona}
        setActivePersonaDid={setActivePersonaDid}
        chainStatus={data.chainStatus}
        pendingActionCount={pendingActionCount}
        onOpenNewDidModal={() => setNewDidModal(true)}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md">
          <div
            className={`brutal-card p-3.5 text-xs font-medium flex items-center justify-between gap-3 ${
              toast.type === 'error'
                ? 'bg-red-100 text-red-950 border-l-8 border-l-[#E11D48]'
                : 'bg-emerald-100 text-emerald-950 border-l-8 border-l-[#059669]'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="font-mono font-bold px-1.5"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1">
        {activeTab === 'dashboard' && (
          <DashboardTab
            data={data}
            activePersona={activePersona}
            onNavigate={setActiveTab}
            onSelectAgreement={setSelectedAgreementId}
          />
        )}

        {activeTab === 'agreements' && (
          <AgreementsTab
            agreements={data.agreements}
            identities={data.identities}
            activePersona={activePersona}
            selectedAgreementId={selectedAgreementId}
            setSelectedAgreementId={setSelectedAgreementId}
            onRefresh={refreshBootstrap}
            onOpenAudit={handleOpenAudit}
            onGoToMilestones={(agId) => {
              setSelectedAgreementId(agId);
              setActiveTab('milestones');
            }}
            showToast={showToast}
          />
        )}

        {activeTab === 'milestones' && (
          <MilestonesTab
            agreements={data.agreements}
            credentials={data.credentials}
            activePersona={activePersona}
            selectedAgreementId={selectedAgreementId}
            setSelectedAgreementId={setSelectedAgreementId}
            onRefresh={refreshBootstrap}
            onNavigate={setActiveTab}
            showToast={showToast}
          />
        )}

        {activeTab === 'reputation' && (
          <ReputationTab
            identities={data.identities}
            credentials={data.credentials}
            zkpProofs={data.zkpProofs}
            activePersona={activePersona}
            onRefresh={refreshBootstrap}
            onOpenAudit={handleOpenAudit}
            showToast={showToast}
          />
        )}

        {activeTab === 'verifier' && (
          <VerifierTab
            credentials={data.credentials}
            agreements={data.agreements}
            presetAudit={presetAudit}
          />
        )}

        {activeTab === 'network' && (
          <NetworkTab
            identities={data.identities}
            trustGraph={data.trustGraph}
            onOpenNewDidModal={() => setNewDidModal(true)}
            onRefresh={refreshBootstrap}
            showToast={showToast}
          />
        )}
      </main>

      <footer className="border-t-2 border-[#111827] bg-[#0F172A] text-slate-300 py-4 px-6 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="font-bold text-white">
            &ldquo;Verify the work. Trust the professional.&rdquo; — TRUSTWORK Consensus Protocol
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Dept. of Information Science &amp; Engineering · W3C DID + Verifiable Credentials + EVM Smart Contracts
          </div>
        </div>
      </footer>

      {newDidModal && (
        <NewDidModal
          onClose={() => setNewDidModal(false)}
          onCreated={async (did, name) => {
            setNewDidModal(false);
            await refreshBootstrap();
            setActivePersonaDid(did);
            showToast(`Self-Controlled DID registered on-chain for ${name}!`);
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function NewDidModal({ onClose, onCreated, showToast }) {
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('Full-Stack & Distributed Ledger Engineer');
  const [role, setRole] = useState('FREELANCER');
  const [organization, setOrganization] = useState('');
  const [issuerTier, setIssuerTier] = useState('INDIVIDUAL');
  const [skillsText, setSkillsText] = useState('TypeScript, Solidity, React, Node.js');
  const [externalAddress, setExternalAddress] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleConnectMetaMask() {
    try {
      const { address } = await connectBrowserWallet();
      setExternalAddress(address);
      showToast(`Connected wallet ${address.slice(0, 10)}...`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch('/api/identities', {
        method: 'POST',
        body: JSON.stringify({
          name,
          headline,
          role,
          organization,
          issuerTier,
          skills: skillsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          externalAddress: externalAddress || null,
        }),
      });
      await onCreated(res.identity.did, res.identity.name);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="brutal-card bg-[#FAF7F0] max-w-lg w-full p-5 space-y-4">
        <div className="flex items-center justify-between border-b-2 border-[#111827] pb-2">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase bg-[#111827] text-[#F59E0B] px-2 py-0.5">
              SELF-SOVEREIGN W3C DID REGISTRATION
            </span>
            <h3 className="font-bold text-base mt-1">Create New Self-Controlled Identity</h3>
          </div>
          <button type="button" onClick={onClose} className="brutal-btn bg-white px-2.5 py-1 text-xs">
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono font-bold mb-1">Full Name / Entity Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Pavithra Nair or ZetaCloud Corp"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="brutal-input w-full text-xs"
              />
            </div>
            <div>
              <label className="block font-mono font-bold mb-1">Primary Role</label>
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  if (e.target.value === 'CLIENT') setIssuerTier('VERIFIED_ORG');
                }}
                className="brutal-input w-full text-xs"
              >
                <option value="FREELANCER">Freelancer (Talent)</option>
                <option value="CLIENT">Gig Provider (Client / Issuer)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono font-bold mb-1">Headline / Title</label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="brutal-input w-full text-xs"
              />
            </div>
            <div>
              <label className="block font-mono font-bold mb-1">Issuer Registry Tier</label>
              <select
                value={issuerTier}
                onChange={(e) => setIssuerTier(e.target.value)}
                className="brutal-input w-full text-xs font-mono"
              >
                <option value="INDIVIDUAL">INDIVIDUAL</option>
                <option value="VERIFIED_ORG">VERIFIED_ORG</option>
                <option value="ENTERPRISE">ENTERPRISE</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-mono font-bold mb-1">Skills / Domain Expertise</label>
            <input
              type="text"
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              className="brutal-input w-full text-xs"
            />
          </div>

          <div className="p-3 bg-white border border-[#111827] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-[11px]">
                Cryptographic Key Source (secp256k1)
              </span>
              <button
                type="button"
                onClick={handleConnectMetaMask}
                className="brutal-btn bg-amber-100 px-2.5 py-1 text-[11px]"
              >
                Link Browser Wallet (MetaMask)
              </button>
            </div>
            <input
              type="text"
              placeholder="Leave blank to auto-generate a new local DID keypair, or connect MetaMask"
              value={externalAddress}
              onChange={(e) => setExternalAddress(e.target.value)}
              className="brutal-input w-full text-xs font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="brutal-btn bg-[#111827] text-white px-4 py-2 text-xs w-full"
          >
            {busy ? 'Anchoring DID On-Chain...' : 'Generate Keypair & Anchor DID on Blockchain'}
          </button>
        </form>
      </div>
    </div>
  );
}
