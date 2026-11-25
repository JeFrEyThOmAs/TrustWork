import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch, shortHex } from '../lib/wallet.js';

export default function VerifyPortalTab({ credentials, agreements, presetAudit }) {
  const [mode, setMode] = useState(presetAudit?.mode || 'credential');
  const [targetId, setTargetId] = useState('');
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
      return;
    }
    if (credentials.length > 0 && !targetId) {
      const first = credentials[0];
      const formatted = JSON.stringify(first.vcDocument, null, 2);
      setMode('credential');
      setTargetId(first.id);
      setJsonText(formatted);
      setOriginalJsonText(formatted);
      runAudit('credential', first.id, formatted);
    }
  }, [presetAudit, credentials.length]);

  async function runAudit(auditMode = mode, id = targetId, rawText = jsonText) {
    if (!id) return;
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

  function simulateFakeEdit() {
    try {
      const parsed = JSON.parse(jsonText);
      if (mode === 'credential' && parsed.credentialSubject) {
        parsed.credentialSubject.statement += ' (Edited without permission)';
      } else if (parsed.compensation) {
        parsed.compensation.totalCost = Number(parsed.compensation.totalCost) + 500000;
      }
      const mutated = JSON.stringify(parsed, null, 2);
      setJsonText(mutated);
      runAudit(mode, targetId, mutated);
    } catch {
      // ignore
    }
  }

  function restoreAuthentic() {
    setJsonText(originalJsonText);
    runAudit(mode, targetId, originalJsonText);
  }

  return (
    <div className="space-y-6">
      <div className="tw-card p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Instant Public Credential &amp; Agreement Verifier
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Any client or employer can independently verify a freelancer&apos;s credential or digital agreement against the blockchain in under 1 second.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={simulateFakeEdit}
              className="tw-btn-secondary px-3 py-1.5 text-xs text-rose-700 border-rose-200 hover:bg-rose-50 flex items-center gap-1"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Test Tampered Document</span>
            </button>
            <button
              type="button"
              onClick={restoreAuthentic}
              className="tw-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Authentic</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Select a Verified Work Credential
            </label>
            <select
              value={mode === 'credential' ? targetId : ''}
              onChange={(e) => {
                const found = credentials.find((c) => c.id === e.target.value);
                if (found) loadItem('credential', found);
              }}
              className="tw-input text-xs"
            >
              <option value="">-- Choose Credential --</option>
              {credentials.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.projectTitle} ({c.subjectName})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Or Select an On-Chain Digital Agreement
            </label>
            <select
              value={mode === 'agreement' ? targetId : ''}
              onChange={(e) => {
                const found = agreements.find((a) => a.id === e.target.value);
                if (found) loadItem('agreement', found);
              }}
              className="tw-input text-xs"
            >
              <option value="">-- Choose Digital Agreement --</option>
              {agreements
                .filter((a) => a.txHash)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} (v{a.version} · {a.status})
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 tw-card p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-700">
              Document JSON (Try editing even 1 character and re-verifying)
            </span>
            <button
              type="button"
              disabled={verifying}
              onClick={() => runAudit(mode, targetId, jsonText)}
              className="tw-btn-primary px-3.5 py-1.5 text-xs"
            >
              {verifying ? 'Checking Blockchain...' : 'Verify Against Blockchain'}
            </button>
          </div>
          <textarea
            rows={18}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="w-full flex-1 p-3 rounded-xl bg-slate-950 text-emerald-300 font-mono text-xs outline-none"
          />
        </div>

        <div className="lg:col-span-6">
          {auditResult && (
            <div
              className={`tw-card p-6 space-y-4 border-2 ${
                auditResult.verified
                  ? 'border-emerald-500 bg-emerald-50/30'
                  : 'border-rose-500 bg-rose-50/30'
              }`}
            >
              <div className="flex items-center gap-3">
                {auditResult.verified ? (
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-8 h-8 text-rose-600 shrink-0" />
                )}
                <div>
                  <h3 className="font-bold text-lg text-slate-900">
                    {auditResult.verified
                      ? 'Authentic & Untampered On-Chain Record'
                      : 'Verification Failed — Tampered or Revoked'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Verified in <strong>{auditResult.auditDurationMs ?? '<1'} ms</strong> against
                    EVM Smart Contract
                  </p>
                </div>
              </div>

              {auditResult.checks && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {Object.entries(auditResult.checks).map(([k, ok]) => (
                    <div
                      key={k}
                      className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
                        ok
                          ? 'bg-white border-emerald-200 text-emerald-800'
                          : 'bg-rose-100 border-rose-300 text-rose-900'
                      }`}
                    >
                      <span>{k}</span>
                      <span className="font-bold">{ok ? 'PASS ✓' : 'FAIL ✗'}</span>
                    </div>
                  ))}
                </div>
              )}

              {auditResult.cryptography && (
                <div className="rounded-xl bg-slate-900 text-slate-200 p-4 text-xs font-mono space-y-1.5">
                  <div className="break-all">
                    <span className="text-slate-400">Recomputed Keccak-256: </span>
                    <span
                      className={
                        auditResult.checks?.payloadIntegrityIntact
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }
                    >
                      {auditResult.cryptography.recomputedKeccak256}
                    </span>
                  </div>
                  {auditResult.mode === 'credential' ? (
                    <div>
                      <span className="text-slate-400">Issuer: </span>
                      <span className="text-sky-300">
                        {auditResult.issuerSummary?.name ||
                          shortHex(auditResult.cryptography.onChainIssuerAddress)}{' '}
                        ({auditResult.issuerSummary?.issuerTier})
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-slate-400">Agreement Status: </span>
                      <span className="text-sky-300">
                        Version {auditResult.cryptography.version} ·{' '}
                        {auditResult.cryptography.onChainStatus}
                      </span>
                    </div>
                  )}
                  {auditResult.cryptography.blockNumber && (
                    <div className="break-all">
                      <span className="text-slate-400">
                        Block #{auditResult.cryptography.blockNumber} Tx:{' '}
                      </span>
                      <span className="text-amber-300">{auditResult.cryptography.txHash}</span>
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
