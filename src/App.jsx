import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AuthScreen from './components/AuthScreen.jsx';
import Sidebar from './components/Navbar.jsx';
import { KeypairVaultModal } from './components/CryptoSignModal.jsx';
import ExploreGigsTab from './components/ExploreGigsTab.jsx';
import TalentDirectoryTab from './components/TalentDirectoryTab.jsx';
import MyGigsProposalsTab from './components/MyGigsProposalsTab.jsx';
import ContractsWorkspaceTab from './components/ContractsWorkspaceTab.jsx';
import ReputationPassportTab from './components/ReputationPassportTab.jsx';
import VerifyPortalTab from './components/VerifyPortalTab.jsx';
import { apiFetch, getStoredToken, setStoredToken } from './lib/wallet.js';

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [publicVerifierMode, setPublicVerifierMode] = useState(false);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('explore');
  const [selectedAgreementId, setSelectedAgreementId] = useState(null);
  const [inspectedDid, setInspectedDid] = useState(null);
  const [directHirePrefill, setDirectHirePrefill] = useState(null);
  const [presetAudit, setPresetAudit] = useState(null);
  const [postGigOpen, setPostGigOpen] = useState(false);
  const [keypairOpen, setKeypairOpen] = useState(false);
  const [toast, setToast] = useState(null);

  function showToast(message, type = 'info') {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }

  const refreshBootstrap = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setAuthenticated(false);
      setData(null);
      setAuthChecked(true);
      return;
    }
    try {
      const res = await apiFetch('/api/bootstrap');
      setData(res);
      setAuthenticated(true);
    } catch (err) {
      if (err.status === 401) {
        setStoredToken('');
        setAuthenticated(false);
        setData(null);
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    refreshBootstrap();
  }, [refreshBootstrap]);

  // Real-time Server-Sent Events sync across multiple browsers/tabs
  useEffect(() => {
    if (!authenticated) return undefined;
    const es = new EventSource('/api/events');
    es.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data);
        if (parsed.type && parsed.type !== 'connected') {
          refreshBootstrap();
        }
      } catch {
        // ignore
      }
    };
    return () => es.close();
  }, [authenticated, refreshBootstrap]);

  async function handleLogout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', body: '{}' });
    } catch {
      // ignore
    }
    setStoredToken('');
    setAuthenticated(false);
    setData(null);
    setActiveTab('explore');
  }

  const currentUser = data?.currentUser || null;

  const pendingContractActions = useMemo(() => {
    if (!data?.agreements || !currentUser) return 0;
    return data.agreements.filter(
      (a) =>
        (a.status === 'PENDING_SIGNATURES' || a.status === 'AMENDMENT_PENDING') &&
        ((a.clientDid === currentUser.did && !a.clientSignature) ||
          (a.freelancerDid === currentUser.did && !a.freelancerSignature))
    ).length;
  }, [data, currentUser]);

  const pendingProposalActions = useMemo(() => {
    if (!data?.gigs || !currentUser) return 0;
    return data.gigs
      .filter((g) => g.posterDid === currentUser.did && g.status === 'OPEN')
      .reduce(
        (sum, g) => sum + (g.proposals?.filter((p) => p.status === 'PENDING').length || 0),
        0
      );
  }, [data, currentUser]);

  if (!authChecked) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white text-xs text-zinc-500">
        Loading workspace...
      </div>
    );
  }

  if (!authenticated && publicVerifierMode) {
    return (
      <div className="h-screen w-screen overflow-hidden">
        <VerifyPortalTab onBackToAuth={() => setPublicVerifierMode(false)} />
      </div>
    );
  }

  if (!authenticated || !data) {
    return (
      <AuthScreen
        onAuthenticated={() => {
          refreshBootstrap();
        }}
        onOpenPublicVerifier={() => setPublicVerifierMode(true)}
      />
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-white">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        chainStatus={data.chainStatus}
        pendingContractActions={pendingContractActions}
        pendingProposalActions={pendingProposalActions}
        onOpenPostGig={() => setPostGigOpen(true)}
        onOpenKeypair={() => setKeypairOpen(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1 min-w-0 h-full overflow-hidden">
        {activeTab === 'explore' && (
          <ExploreGigsTab
            gigs={data.gigs}
            currentUser={currentUser}
            onOpenPostGig={() => setPostGigOpen(true)}
            onOpenContract={(agId) => {
              setSelectedAgreementId(agId);
              setActiveTab('contracts');
            }}
            onInspectPassport={(did) => {
              setInspectedDid(did);
              setActiveTab('reputation');
            }}
            onRefresh={refreshBootstrap}
            showToast={showToast}
          />
        )}

        {activeTab === 'my-gigs' && (
          <MyGigsProposalsTab
            gigs={data.gigs}
            myProposals={data.myProposals}
            currentUser={currentUser}
            onOpenPostGig={() => setPostGigOpen(true)}
            onInspectPassport={(did) => {
              setInspectedDid(did);
              setActiveTab('reputation');
            }}
            onOpenContract={(agId) => {
              setSelectedAgreementId(agId);
              setActiveTab('contracts');
            }}
            onRefresh={refreshBootstrap}
            showToast={showToast}
          />
        )}

        {activeTab === 'contracts' && (
          <ContractsWorkspaceTab
            agreements={data.agreements}
            credentials={data.credentials}
            messages={data.messages}
            identities={data.identities}
            currentUser={currentUser}
            selectedAgreementId={selectedAgreementId}
            setSelectedAgreementId={setSelectedAgreementId}
            directHirePrefill={directHirePrefill}
            clearDirectHirePrefill={() => setDirectHirePrefill(null)}
            onOpenAudit={(mode, targetId, payload) => {
              setPresetAudit({ mode, targetId, payload });
              setActiveTab('verify');
            }}
            onNavigate={setActiveTab}
            onRefresh={refreshBootstrap}
            showToast={showToast}
          />
        )}

        {activeTab === 'talent' && (
          <TalentDirectoryTab
            identities={data.identities}
            credentials={data.credentials}
            currentUser={currentUser}
            onInspectPassport={(did) => {
              setInspectedDid(did);
              setActiveTab('reputation');
            }}
            onStartDirectAgreement={(freelancer) => {
              setDirectHirePrefill(freelancer);
              setActiveTab('contracts');
            }}
          />
        )}

        {activeTab === 'reputation' && (
          <ReputationPassportTab
            identities={data.identities}
            credentials={data.credentials}
            zkpProofs={data.zkpProofs}
            recentTransactions={data.recentTransactions}
            trustGraph={data.trustGraph}
            currentUser={currentUser}
            inspectedDid={inspectedDid}
            setInspectedDid={setInspectedDid}
            onOpenAudit={(mode, targetId, payload) => {
              setPresetAudit({ mode, targetId, payload });
              setActiveTab('verify');
            }}
            onRefresh={refreshBootstrap}
            showToast={showToast}
          />
        )}

        {activeTab === 'verify' && (
          <VerifyPortalTab
            credentials={data.credentials}
            agreements={data.agreements}
            presetAudit={presetAudit}
          />
        )}
      </main>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <div
            className={`px-4 py-2.5 rounded-md shadow-lg border text-xs flex items-center justify-between gap-3 ${
              toast.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-zinc-900 border-zinc-800 text-zinc-100'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="opacity-70 hover:opacity-100 cursor-pointer"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {postGigOpen && (
        <PostGigModal
          onClose={() => setPostGigOpen(false)}
          onCreated={async () => {
            setPostGigOpen(false);
            await refreshBootstrap();
            setActiveTab('explore');
            showToast('Gig published.');
          }}
          showToast={showToast}
        />
      )}

      {keypairOpen && (
        <KeypairVaultModal
          onClose={() => setKeypairOpen(false)}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function PostGigModal({ onClose, onCreated, showToast }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Software Development');
  const [description, setDescription] = useState('');
  const [budgetMin, setBudgetMin] = useState(50000);
  const [budgetMax, setBudgetMax] = useState(120000);
  const [currency, setCurrency] = useState('INR');
  const [durationDays, setDurationDays] = useState(21);
  const [deadline, setDeadline] = useState(
    new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10)
  );
  const [skillsText, setSkillsText] = useState('');
  const [features, setFeatures] = useState([
    { name: '', acceptanceCriteria: 'Meets specification' },
  ]);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/gigs', {
        method: 'POST',
        body: JSON.stringify({
          title,
          category,
          description,
          budgetMin: Number(budgetMin),
          budgetMax: Number(budgetMax),
          currency,
          durationDays: Number(durationDays),
          deadline,
          skills: skillsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          features: features.filter((f) => f.name.trim()),
        }),
      });
      await onCreated();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white border border-zinc-200 rounded-lg shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
          <h3 className="text-base font-semibold text-zinc-900">Post a Gig</h3>
          <button type="button" onClick={onClose} className="ui-btn-secondary py-1 px-2.5 text-xs">
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block font-medium text-zinc-700 mb-1">Gig title</label>
              <input
                type="text"
                required
                placeholder="e.g. Build Payment Webhook Service"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="ui-input"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="ui-input"
              >
                <option>Software Development</option>
                <option>Backend &amp; Systems</option>
                <option>AI &amp; Data</option>
                <option>Product Design</option>
                <option>Mobile Engineering</option>
                <option>Smart Contracts</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-zinc-700 mb-1">Description</label>
            <textarea
              rows={3}
              required
              placeholder="Outline requirements, architecture context, and deliverables..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="ui-input"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Min budget ({currency})</label>
              <input
                type="number"
                required
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
                className="ui-input tabular-nums"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Max budget ({currency})</label>
              <input
                type="number"
                required
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                className="ui-input tabular-nums"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Duration (days)</label>
              <input
                type="number"
                required
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                className="ui-input tabular-nums"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Deadline</label>
              <input
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="ui-input font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-zinc-700 mb-1">Skills (comma-separated)</label>
            <input
              type="text"
              placeholder="Node.js, PostgreSQL, TypeScript"
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              className="ui-input"
            />
          </div>

          <div className="border border-zinc-200 rounded-lg p-3.5 bg-zinc-50/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-800">Features / Deliverables</span>
              <button
                type="button"
                onClick={() =>
                  setFeatures([
                    ...features,
                    { name: '', acceptanceCriteria: 'Meets specification' },
                  ])
                }
                className="text-zinc-900 underline cursor-pointer"
              >
                + Add feature
              </button>
            </div>
            {features.map((f, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Feature name"
                  value={f.name}
                  onChange={(e) => {
                    const next = [...features];
                    next[idx] = { ...next[idx], name: e.target.value };
                    setFeatures(next);
                  }}
                  className="ui-input"
                />
                <input
                  type="text"
                  placeholder="Acceptance criteria"
                  value={f.acceptanceCriteria}
                  onChange={(e) => {
                    const next = [...features];
                    next[idx] = { ...next[idx], acceptanceCriteria: e.target.value };
                    setFeatures(next);
                  }}
                  className="ui-input"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="ui-btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="ui-btn-primary">
              {busy ? 'Publishing...' : 'Publish Gig'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
