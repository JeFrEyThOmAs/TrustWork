import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { apiFetch, shortHex } from '../lib/wallet.js';

export default function VerifyPortalTab({
  credentials = [],
  agreements = [],
  presetAudit,
  onBackToAuth,
}) {
  const [mode, setMode] = useState(presetAudit?.mode || 'credential');
  const [targetId, setTargetId] = useState(presetAudit?.targetId || '');
  const [jsonText, setJsonText] = useState('');
  const [originalJsonText, setOriginalJsonText] = useState('');
  const [auditResult, setAuditResult] = useState(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (presetAudit?.targetId) {
      setMode(presetAudit.mode);
      setTargetId(presetAudit.targetId);
      const formatted = JSON.stringify(presetAudit.payload, null, 2);
      setJsonText(formatted);
      setOriginalJsonText(formatted);
      runAudit(presetAudit.mode, presetAudit.targetId, formatted);
    }
  }, [presetAudit]);

  async function runAudit(auditMode = mode, id = targetId, rawText = jsonText) {
    setVerifying(true);
    try {
      const parsed = rawText ? JSON.parse(rawText) : null;
      const res = await apiFetch('/api/verify', {
        method: 'POST',
        body: JSON.stringify({ mode: auditMode, targetId: id, documentJson: parsed }),
      });
      setAuditResult(res);
    } catch (err) {
      setAuditResult({ error: err.message, verified: false });
    } finally {
      setVerifying(false);
    }
  }

  function loadItem(nextMode, item) {
    setMode(nextMode);
    setTargetId(item.id);
    const doc = nextMode === 'credential' ? item.vcDocument : item.canonicalPayload;
    const formatted = JSON.stringify(doc, null, 2);
    setJsonText(formatted);
    setOriginalJsonText(formatted);
    runAudit(nextMode, item.id, formatted);
  }

  function mutateSample() {
    try {
      const parsed = JSON.parse(jsonText);
      if (mode === 'credential' && parsed.credentialSubject) {
        parsed.credentialSubject.statement += ' [Altered]';
      } else if (parsed.compensation) {
        parsed.compensation.totalCost = Number(parsed.compensation.totalCost) + 100000;
      }
      const mutated = JSON.stringify(parsed, null, 2);
      setJsonText(mutated);
      runAudit(mode, targetId, mutated);
    } catch {
      // ignore
    }
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="h-14 shrink-0 border-b border-zinc-200 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBackToAuth && (
            <button
              type="button"
              onClick={onBackToAuth}
              className="ui-btn-secondary py-1 px-2.5 text-xs"
            >
              ← Sign in
            </button>
          )}
          <h1 className="text-sm font-semibold text-zinc-900">
            Cryptographic Verification Portal
          </h1>
        </div>

        {jsonText && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={mutateSample}
              className="ui-btn-secondary py-1 px-2.5 text-xs"
            >
              Simulate Tamper
            </button>
            {originalJsonText && (
              <button
                type="button"
                onClick={() => {
                  setJsonText(originalJsonText);
                  runAudit(mode, targetId, originalJsonText);
                }}
                className="ui-btn-secondary py-1 px-2.5 text-xs"
              >
                Reset JSON
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
        {/* Left Input Pane */}
        <div className="lg:col-span-6 border-r border-zinc-200 p-6 flex flex-col gap-4 overflow-y-auto">
          {(credentials.length > 0 || agreements.some((a) => a.txHash)) && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Load credential</label>
                <select
                  value={mode === 'credential' ? targetId : ''}
                  onChange={(e) => {
                    const found = credentials.find((c) => c.id === e.target.value);
                    if (found) loadItem('credential', found);
                  }}
                  className="ui-input"
                >
                  <option value="">Select credential...</option>
                  {credentials.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.projectTitle} ({c.subjectName})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Load agreement</label>
                <select
                  value={mode === 'agreement' ? targetId : ''}
                  onChange={(e) => {
                    const found = agreements.find((a) => a.id === e.target.value);
                    if (found) loadItem('agreement', found);
                  }}
                  className="ui-input"
                >
                  <option value="">Select agreement...</option>
                  {agreements
                    .filter((a) => a.txHash)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} (v{a.version})
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-medium text-zinc-700 mb-1">Record type</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="ui-input"
              >
                <option value="credential">W3C Credential</option>
                <option value="agreement">Digital Agreement</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block font-medium text-zinc-700 mb-1">On-Chain Record ID (0x...)</label>
              <input
                type="text"
                placeholder="0x..."
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="ui-input font-mono"
              />
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-[260px]">
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Document JSON (paste exported .vc.json or edit to test integrity)
            </label>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='Paste W3C Verifiable Credential JSON-LD or Agreement JSON here...'
              className="w-full flex-1 p-3 rounded-md bg-zinc-950 text-zinc-200 font-mono text-xs outline-none"
            />
          </div>

          <button
            type="button"
            disabled={verifying}
            onClick={() => runAudit(mode, targetId, jsonText)}
            className="ui-btn-primary py-2"
          >
            {verifying ? 'Verifying against Smart Contract...' : 'Run Blockchain Audit'}
          </button>
        </div>

        {/* Right Result Pane */}
        <div className="lg:col-span-6 p-6 sm:p-8 overflow-y-auto">
          {!auditResult ? (
            <div className="h-full flex items-center justify-center text-xs text-zinc-400">
              Select or paste a credential or agreement JSON to verify its Keccak-256 hash, signatures, and revocation status on-chain.
            </div>
          ) : (
            <div className="space-y-5">
              <div
                className={`p-4 rounded-lg border flex items-start gap-3 ${
                  auditResult.verified
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-red-50 border-red-200 text-red-950'
                }`}
              >
                {auditResult.verified ? (
                  <Check className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                ) : (
                  <X className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-sm font-semibold">
                    {auditResult.verified
                      ? 'Authentic On-Chain Record'
                      : 'Verification Failed'}
                  </div>
                  <div className="text-xs opacity-80 mt-0.5">
                    {auditResult.error ||
                      `Completed in ${auditResult.auditDurationMs ?? '<1'} ms against TrustWorkProtocol.sol`}
                  </div>
                </div>
              </div>

              {auditResult.checks && (
                <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-200 text-xs">
                  {Object.entries(auditResult.checks).map(([k, passed]) => (
                    <div key={k} className="p-3 flex items-center justify-between">
                      <span className="text-zinc-700 font-mono">{k}</span>
                      <span
                        className={`font-semibold ${
                          passed ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {passed ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {auditResult.cryptography && (
                <div className="p-4 rounded-lg bg-zinc-950 text-zinc-300 font-mono text-xs space-y-1.5">
                  <div className="break-all">
                    Recomputed Keccak-256: {auditResult.cryptography.recomputedKeccak256}
                  </div>
                  {auditResult.mode === 'credential' ? (
                    <div>
                      Issuer: {auditResult.issuerSummary?.name || shortHex(auditResult.cryptography.onChainIssuerAddress)} ({auditResult.issuerSummary?.issuerTier})
                    </div>
                  ) : (
                    <div>
                      Status: v{auditResult.cryptography.version} · {auditResult.cryptography.onChainStatus}
                    </div>
                  )}
                  {auditResult.cryptography.blockNumber && (
                    <div className="break-all text-emerald-400">
                      Block #{auditResult.cryptography.blockNumber} · Tx {auditResult.cryptography.txHash}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
