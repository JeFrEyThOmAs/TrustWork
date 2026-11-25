import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { apiFetch, connectBrowserWallet, setStoredToken } from '../lib/wallet.js';

export default function AuthScreen({ onAuthenticated, onOpenPublicVerifier }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [headline, setHeadline] = useState('');
  const [hourlyRate, setHourlyRate] = useState('2500');
  const [organization, setOrganization] = useState('');
  const [issuerTier, setIssuerTier] = useState('INDIVIDUAL');
  const [skillsText, setSkillsText] = useState('');
  const [externalAddress, setExternalAddress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleLinkWallet() {
    setError('');
    try {
      const { address } = await connectBrowserWallet();
      setExternalAddress(address);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const res = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setStoredToken(res.token);
        onAuthenticated(res.user);
      } else {
        const res = await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name,
            email,
            password,
            headline: headline || 'Independent Contractor & Client',
            hourlyRate: Number(hourlyRate) || 2500,
            organization,
            issuerTier,
            skills: skillsText
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            externalAddress: externalAddress || null,
          }),
        });
        setStoredToken(res.token);
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-12 bg-white">
      {/* Left Brand & Protocol Specification Panel */}
      <div className="hidden lg:flex lg:col-span-5 bg-zinc-950 text-zinc-100 p-12 flex-col justify-between border-r border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-white text-zinc-950 font-bold text-sm flex items-center justify-center">
              T
            </div>
            <span className="font-semibold text-base tracking-tight">TrustWork</span>
          </div>

          <div className="mt-16 max-w-md space-y-5">
            <h1 className="text-3xl font-semibold tracking-tight leading-snug text-white">
              Freelance marketplace backed by cryptographic agreements and portable credentials.
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Post gigs or apply for contracts from a single account. Scope, timeline, and compensation are anchored on-chain only when both parties sign, and completed work produces independently verifiable W3C credentials.
            </p>
          </div>

          <div className="mt-12 space-y-4 border-t border-zinc-800 pt-8 text-xs text-zinc-400 max-w-md">
            <div className="flex justify-between">
              <span className="text-zinc-200 font-medium">Unified Account</span>
              <span>Hire talent &amp; apply to gigs</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-200 font-medium">Dual-Signature Contracts</span>
              <span>Mutual consent required to modify</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-200 font-medium">Portable Reputation</span>
              <span>W3C DID + JSON-LD Verifiable Credentials</span>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-500">
          <span>Verify the work. Trust the professional.</span>
          <button
            type="button"
            onClick={onOpenPublicVerifier}
            className="text-zinc-300 hover:text-white underline underline-offset-4 cursor-pointer"
          >
            Public Proof Verifier
          </button>
        </div>
      </div>

      {/* Right Authentication Form */}
      <div className="lg:col-span-7 flex flex-col justify-center px-6 sm:px-16 lg:px-24 py-12">
        <div className="w-full max-w-md mx-auto">
          <div className="lg:hidden flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-zinc-900 text-white font-bold text-xs flex items-center justify-center">
                T
              </div>
              <span className="font-semibold text-base">TrustWork</span>
            </div>
            <button
              type="button"
              onClick={onOpenPublicVerifier}
              className="text-xs text-zinc-600 underline cursor-pointer"
            >
              Verify a Credential
            </button>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-zinc-900">
              {mode === 'login' ? 'Sign in to TrustWork' : 'Create your TrustWork account'}
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              {mode === 'login'
                ? 'Enter your email and password to access your workspace.'
                : 'Your account automatically provisions a self-controlled blockchain DID.'}
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="grid grid-cols-2 p-1 bg-zinc-100 rounded-md mb-6 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`py-1.5 rounded transition cursor-pointer ${
                mode === 'login' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`py-1.5 rounded transition cursor-pointer ${
                mode === 'register' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600'
              }`}
            >
              Create account
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Full name</label>
                <input
                  type="text"
                  required
                  placeholder="Alex Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="ui-input"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Email address</label>
              <input
                type="email"
                required
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="ui-input"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ui-input"
              />
            </div>

            {mode === 'register' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Title / Headline
                    </label>
                    <input
                      type="text"
                      placeholder="Backend Engineer / Founder"
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      className="ui-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Hourly rate (INR)
                    </label>
                    <input
                      type="number"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      className="ui-input tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Organization (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Company or Studio"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      className="ui-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Account type
                    </label>
                    <select
                      value={issuerTier}
                      onChange={(e) => setIssuerTier(e.target.value)}
                      className="ui-input"
                    >
                      <option value="INDIVIDUAL">Individual</option>
                      <option value="VERIFIED_ORG">Verified Company</option>
                      <option value="ENTERPRISE">Enterprise</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Skills (comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="TypeScript, Go, React, UI Design"
                    value={skillsText}
                    onChange={(e) => setSkillsText(e.target.value)}
                    className="ui-input"
                  />
                </div>

                <div className="pt-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-zinc-700">
                      External Ethereum Wallet (optional)
                    </label>
                    <button
                      type="button"
                      onClick={handleLinkWallet}
                      className="text-xs font-medium text-zinc-900 underline cursor-pointer"
                    >
                      Connect MetaMask
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Leave empty to auto-generate a signing keypair"
                    value={externalAddress}
                    onChange={(e) => setExternalAddress(e.target.value)}
                    className="ui-input font-mono text-xs"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={busy}
              className="ui-btn-primary w-full py-2.5 mt-2"
            >
              {busy
                ? 'Please wait...'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
