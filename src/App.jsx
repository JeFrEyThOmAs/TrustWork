import React, { useEffect, useMemo, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import ExploreGigsTab from './components/ExploreGigsTab.jsx';
import TalentDirectoryTab from './components/TalentDirectoryTab.jsx';
import MyGigsProposalsTab from './components/MyGigsProposalsTab.jsx';
import ContractsWorkspaceTab from './components/ContractsWorkspaceTab.jsx';
import ReputationPassportTab from './components/ReputationPassportTab.jsx';
import VerifyPortalTab from './components/VerifyPortalTab.jsx';
import { apiFetch, connectBrowserWallet } from './lib/wallet.js';

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('explore');
  const [currentUserDid, setCurrentUserDid] = useState('');
  const [selectedAgreementId, setSelectedAgreementId] = useState(null);
  const [inspectedDid, setInspectedDid] = useState(null);
  const [directHirePrefill, setDirectHirePrefill] = useState(null);
  const [presetAudit, setPresetAudit] = useState(null);
  const [postGigOpen, setPostGigOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
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
      if (!currentUserDid && res.identities?.length > 0) {
        setCurrentUserDid(res.identities[0].did);
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

  const currentUser = useMemo(() => {
    if (!data?.identities) return null;
    return data.identities.find((u) => u.did === currentUserDid) || data.identities[0] || null;
  }, [data, currentUserDid]);

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

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="tw-card p-6 text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-extrabold text-lg flex items-center justify-center mx-auto">
            T
          </div>
          <div className="font-bold text-sm text-slate-800">Loading TrustWork Marketplace...</div>
          <p className="text-xs text-slate-500">Syncing gigs, digital agreements &amp; on-chain credentials</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        identities={data.identities}
        currentUser={currentUser}
        setCurrentUserDid={(did) => {
          setCurrentUserDid(did);
          setInspectedDid(did);
        }}
        chainStatus={data.chainStatus}
        pendingContractActions={pendingContractActions}
        pendingProposalActions={pendingProposalActions}
        onOpenPostGig={() => setPostGigOpen(true)}
        onOpenAuthModal={() => setAuthModalOpen(true)}
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md">
          <div
            className={`rounded-xl px-4 py-3 shadow-lg border text-xs font-medium flex items-center justify-between gap-3 ${
              toast.type === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white font-bold cursor-pointer"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1">
        {activeTab === 'explore' && (
          <ExploreGigsTab
            gigs={data.gigs}
            currentUser={currentUser}
            pendingContractActions={pendingContractActions}
            onOpenPostGig={() => setPostGigOpen(true)}
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

        {activeTab === 'my-gigs' && (
          <MyGigsProposalsTab
            gigs={data.gigs}
            proposals={data.proposals}
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

        {activeTab === 'reputation' && (
          <ReputationPassportTab
            identities={data.identities}
            credentials={data.credentials}
            zkpProofs={data.zkpProofs}
            recentTransactions={data.recentTransactions}
            smartDataSeparation={data.smartDataSeparation}
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

      <footer className="bg-white border-t border-slate-200 py-5 px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="font-semibold text-slate-700">
            TrustWork — Verify the work. Trust the professional.
          </div>
          <div>
            Self-Controlled W3C DIDs · Dual-Signed Blockchain Digital Agreements · Portable Verifiable Credentials
          </div>
        </div>
      </footer>

      {postGigOpen && (
        <PostGigModal
          currentUser={currentUser}
          onClose={() => setPostGigOpen(false)}
          onCreated={async () => {
            setPostGigOpen(false);
            await refreshBootstrap();
            setActiveTab('explore');
            showToast('Your gig is now live on the TrustWork Marketplace!');
          }}
          showToast={showToast}
        />
      )}

      {authModalOpen && (
        <AuthModal
          onClose={() => setAuthModalOpen(false)}
          onAuthenticated={async (did, name) => {
            setAuthModalOpen(false);
            await refreshBootstrap();
            setCurrentUserDid(did);
            setInspectedDid(did);
            showToast(`Signed in as ${name}`);
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function PostGigModal({ currentUser, onClose, onCreated, showToast }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Full-Stack Development');
  const [description, setDescription] = useState('');
  const [budgetMin, setBudgetMin] = useState(150000);
  const [budgetMax, setBudgetMax] = useState(250000);
  const [currency, setCurrency] = useState('INR');
  const [durationDays, setDurationDays] = useState(21);
  const [deadline, setDeadline] = useState('2026-12-28');
  const [skillsText, setSkillsText] = useState('React, Node.js, PostgreSQL, TypeScript');
  const [features, setFeatures] = useState([
    { name: 'Core Application & API', acceptanceCriteria: 'All endpoints & UI working' },
    { name: 'Automated Tests & Deployment', acceptanceCriteria: 'CI green + live staging link' },
  ]);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/gigs', {
        method: 'POST',
        body: JSON.stringify({
          posterDid: currentUser.did,
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
          features,
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
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="tw-card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between border-b border-slate-200 pb-3">
          <div>
            <span className="text-xs font-bold text-indigo-600 uppercase">Post a Gig</span>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5">
              Hire Verified Freelancers on TrustWork
            </h3>
            <p className="text-xs text-slate-500">
              Posting as <strong>{currentUser?.name}</strong>
            </p>
          </div>
          <button type="button" onClick={onClose} className="tw-btn-secondary px-3 py-1.5 text-xs">
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Gig Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Build Real-Time SaaS Billing & Analytics Dashboard"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="tw-input text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="tw-input text-xs"
              >
                <option>Full-Stack Development</option>
                <option>Backend &amp; Distributed Systems</option>
                <option>AI &amp; Machine Learning</option>
                <option>UI/UX &amp; Product Design</option>
                <option>Mobile Development</option>
                <option>Smart Contracts &amp; Web3</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Project Description</label>
            <textarea
              rows={3}
              required
              placeholder="Describe what you need built, key goals, and technical expectations..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="tw-input text-xs"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Min Budget</label>
              <input
                type="number"
                required
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
                className="tw-input text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Max Budget</label>
              <input
                type="number"
                required
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                className="tw-input text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Duration (Days)</label>
              <input
                type="number"
                required
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                className="tw-input text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target Deadline</label>
              <input
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="tw-input text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Required Skills</label>
            <input
              type="text"
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              className="tw-input text-xs"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Expected Features / Deliverables</span>
              <button
                type="button"
                onClick={() =>
                  setFeatures([...features, { name: '', acceptanceCriteria: 'Verified pass' }])
                }
                className="text-indigo-600 font-semibold hover:underline cursor-pointer"
              >
                + Add Feature
              </button>
            </div>
            {features.map((f, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Feature name"
                  value={f.name}
                  onChange={(e) => {
                    const next = [...features];
                    next[idx] = { ...next[idx], name: e.target.value };
                    setFeatures(next);
                  }}
                  className="tw-input text-xs"
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
                  className="tw-input text-xs"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="tw-btn-secondary px-4 py-2 text-xs">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="tw-btn-primary px-5 py-2 text-xs">
              {busy ? 'Publishing...' : 'Publish Gig'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AuthModal({ onClose, onAuthenticated, showToast }) {
  const [tab, setTab] = useState('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [headline, setHeadline] = useState('Full-Stack Developer & Startup Founder');
  const [hourlyRate, setHourlyRate] = useState(3500);
  const [organization, setOrganization] = useState('');
  const [skillsText, setSkillsText] = useState('React, TypeScript, Node.js, Solidity');
  const [externalAddress, setExternalAddress] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleConnectWallet() {
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
      if (tab === 'login') {
        const res = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        await onAuthenticated(res.identity.did, res.identity.name);
      } else {
        const res = await apiFetch('/api/identities', {
          method: 'POST',
          body: JSON.stringify({
            name,
            email,
            password: password || 'demo123',
            headline,
            hourlyRate: Number(hourlyRate),
            organization,
            skills: skillsText
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            externalAddress: externalAddress || null,
          }),
        });
        await onAuthenticated(res.identity.did, res.identity.name);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="tw-card max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('signup')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                tab === 'signup' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => setTab('login')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                tab === 'login' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              Log In
            </button>
          </div>
          <button type="button" onClick={onClose} className="tw-btn-secondary px-2.5 py-1 text-xs">
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {tab === 'signup' ? (
            <>
              <p className="text-slate-500">
                One unified TrustWork account lets you <strong>apply to gigs as a freelancer</strong> and <strong>post gigs to hire talent</strong>, backed by your own blockchain DID.
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jeffrey Thomas"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="tw-input text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="you@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="tw-input text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="tw-input text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Professional Headline</label>
                <input
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  className="tw-input text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Skills (comma-separated)</label>
                <input
                  type="text"
                  value={skillsText}
                  onChange={(e) => setSkillsText(e.target.value)}
                  className="tw-input text-xs"
                />
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Blockchain DID Wallet (Optional)</span>
                  <button
                    type="button"
                    onClick={handleConnectWallet}
                    className="text-indigo-600 font-semibold hover:underline cursor-pointer"
                  >
                    Connect MetaMask
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Leave blank to auto-generate your self-custodial DID keypair"
                  value={externalAddress}
                  onChange={(e) => setExternalAddress(e.target.value)}
                  className="tw-input text-xs font-mono"
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-slate-500">
                Log in with email &amp; password (seeded demo accounts like <code>mili@trustwork.io</code> use password <code>demo123</code>), or switch accounts anytime from the navbar.
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  placeholder="mili@trustwork.io"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="tw-input text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  placeholder="demo123"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="tw-input text-xs"
                />
              </div>
            </>
          )}

          <button type="submit" disabled={busy} className="tw-btn-primary w-full py-2.5 text-xs">
            {busy
              ? 'Processing...'
              : tab === 'signup'
                ? 'Create Account & Mint Blockchain DID'
                : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  );
}
