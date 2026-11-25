import React, { useEffect, useState } from 'react';
import {
  SearchCheck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertTriangle,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch, shortHex } from '../lib/wallet.js';

export default function VerifierTab({ credentials, agreements, presetAudit }) {
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
        body: JSON.stringify({
          mode: auditMode,
          targetId: id,
          documentJson: parsed,
        }),
      });
      setAuditResult(res);
    } catch (err) {
      setAuditResult({ error: err.message, verified: false });
    } finally {
      setVerifying(false);
    }
  }

  function loadPresetItem(nextMode, item) {
    setMode(nextMode);
    setTargetId(item.id);
    const doc = nextMode === 'credential' ? item.vcDocument : item.canonicalPayload;
    const formatted = JSON.stringify(doc, null, 2);
    setJsonText(formatted);
    setOriginalJsonText(formatted);
    runAudit(nextMode, item.id, formatted);
  }

  function injectSingleCharTamper() {
    try {
      const parsed = JSON.parse(jsonText);
      if (mode === 'credential' && parsed.credentialSubject) {
        parsed.credentialSubject.statement =
          parsed.credentialSubject.statement + ' (Forged Claim)';
      } else if (parsed.compensation) {
        parsed.compensation.totalCost = Number(parsed.compensation.totalCost) + 999999;
      }
      const mutated = JSON.stringify(parsed, null, 2);
      setJsonText(mutated);
      runAudit(mode, targetId, mutated);
    } catch {
      // ignore invalid JSON
    }
  }

  function restoreUntampered() {
    setJsonText(originalJsonText);
    runAudit(mode, targetId, originalJsonText);
  }

  return (
    <div className="space-y-5">
      <div className="brutal-card p-5 bg-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 bg-[#059669] text-white border border-[#111827]">
              SLIDE 04, 07 &amp; 09 · ZERO-TRUST 1-SECOND INDEPENDENT AUDIT
            </span>
            <h2 className="text-xl font-bold mt-1">
              Cryptographic Verification Portal (W3C Credentials &amp; Digital Agreements)
            </h2>
            <p className="text-xs text-slate-600">
              Verify 1. Who issued/signed it · 2. When it was anchored · 3. Whether even 1 byte was modified (Keccak-256) · 4. Revocation / Version status.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={injectSingleCharTamper}
              className="brutal-btn bg-rose-100 text-rose-950 px-3 py-1.5 text-xs flex items-center gap-1"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-[#E11D48]" />
              <span>Tamper Payload (Slide 09 Demo)</span>
            </button>
            <button
              type="button"
              onClick={restoreUntampered}
              className="brutal-btn bg-white px-3 py-1.5 text-xs flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Authentic JSON</span>
            </button>
          </div>
        </div>

        {/* Quick Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-200 text-xs">
          <div>
            <label className="block font-mono font-bold mb-1">Load W3C Verifiable Credential</label>
            <select
              value={mode === 'credential' ? targetId : ''}
              onChange={(e) => {
                const found = credentials.find((c) => c.id === e.target.value);
                if (found) loadPresetItem('credential', found);
              }}
              className="brutal-input w-full text-xs"
            >
              <option value="">-- Select a Credential --</option>
              {credentials.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.projectTitle} ({c.subjectName} ← {c.issuerName})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-mono font-bold mb-1">Load Anchored Digital Agreement</label>
            <select
              value={mode === 'agreement' ? targetId : ''}
              onChange={(e) => {
                const found = agreements.find((a) => a.id === e.target.value);
                if (found) loadPresetItem('agreement', found);
              }}
              className="brutal-input w-full text-xs"
            >
              <option value="">-- Select an Agreement --</option>
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

      {/* Editor + Live Audit Report */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 brutal-card p-4 bg-white flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold uppercase">
              Candidate Off-Chain Document (Editable to Test Tampering)
            </span>
            <button
              type="button"
              disabled={verifying}
              onClick={() => runAudit(mode, targetId, jsonText)}
              className="brutal-btn bg-[#111827] text-white px-3 py-1 text-xs"
            >
              {verifying ? 'Auditing...' : 'Run 1-Sec Blockchain Audit'}
            </button>
          </div>
          <textarea
            rows={18}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="w-full flex-1 p-3 bg-slate-950 text-emerald-300 font-mono text-xs border-2 border-[#111827] outline-none"
          />
        </div>

        <div className="lg:col-span-6 space-y-4">
          {auditResult && (
            <div
              className={`brutal-card p-5 ${
                auditResult.verified ? 'bg-emerald-50' : 'bg-rose-50'
              }`}
            >
              <div className="flex items-center justify-between border-b-2 border-[#111827] pb-3">
                <div className="flex items-center gap-2">
                  {auditResult.verified ? (
                    <CheckCircle2 className="w-7 h-7 text-emerald-700" />
                  ) : (
                    <XCircle className="w-7 h-7 text-red-700" />
                  )}
                  <div>
                    <h3 className="font-bold text-lg">
                      {auditResult.verified
                        ? 'CRYPTOGRAPHICALLY AUTHENTIC & UNTAMPERED'
                        : 'VERIFICATION FAILED — TAMPERED / REVOKED'}
                    </h3>
                    <div className="text-xs font-mono text-slate-700">
                      Completed in <strong>{auditResult.auditDurationMs ?? '<1'} ms</strong> against{' '}
                      <code>TrustWorkProtocol.sol</code>
                    </div>
                  </div>
                </div>
              </div>

              {auditResult.error ? (
                <div className="mt-3 text-xs font-mono text-red-800">{auditResult.error}</div>
              ) : (
                <>
                  {/* Individual Check Matrix */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
                    {Object.entries(auditResult.checks || {}).map(([key, passed]) => (
                      <div
                        key={key}
                        className={`p-2.5 border-2 border-[#111827] text-xs font-mono flex items-center justify-between ${
                          passed ? 'bg-white text-emerald-900' : 'bg-red-200 text-red-950'
                        }`}
                      >
                        <span>{key}</span>
                        <span className="font-bold">{passed ? 'PASS ✓' : 'FAIL ✗'}</span>
                      </div>
                    ))}
                  </div>

                  {/* Cryptographic Telemetry */}
                  <div className="mt-4 p-3.5 bg-slate-950 text-slate-200 font-mono text-xs space-y-1.5 border-2 border-[#111827]">
                    <div className="text-[#F59E0B] font-bold uppercase text-[11px]">
                      On-Chain Audit Proof Details
                    </div>
                    <div className="break-all">
                      <span className="text-slate-400">Recomputed Keccak-256: </span>
                      <span
                        className={
                          auditResult.checks?.payloadIntegrityIntact
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }
                      >
                        {auditResult.cryptography?.recomputedKeccak256}
                      </span>
                    </div>
                    {auditResult.mode === 'credential' ? (
                      <>
                        <div className="break-all">
                          <span className="text-slate-400">Recovered ECDSA Signer: </span>
                          {auditResult.cryptography?.recoveredIssuerAddress || 'Signature Invalid'}
                        </div>
                        <div>
                          <span className="text-slate-400">Issuer Identity &amp; Tier: </span>
                          <span className="text-sky-300">
                            {auditResult.issuerSummary?.name ||
                              shortHex(auditResult.cryptography?.onChainIssuerAddress)}{' '}
                            ({auditResult.issuerSummary?.issuerTier})
                          </span>
                        </div>
                        {auditResult.cryptography?.revocationReason && (
                          <div className="text-rose-400">
                            Revocation Reason: {auditResult.cryptography.revocationReason}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="text-slate-400">Agreement Version &amp; Status: </span>
                          <span className="text-sky-300">
                            v{auditResult.cryptography?.version} ·{' '}
                            {auditResult.cryptography?.onChainStatus}
                          </span>
                        </div>
                        {auditResult.cryptography?.supersededBy && (
                          <div className="text-amber-300 break-all">
                            Note: Superseded by newer mutually signed Agreement{' '}
                            {auditResult.cryptography.supersededBy}
                          </div>
                        )}
                      </>
                    )}
                    {auditResult.cryptography?.blockNumber && (
                      <div className="break-all">
                        <span className="text-slate-400">
                          Block #{auditResult.cryptography.blockNumber} Tx:{' '}
                        </span>
                        <span className="text-amber-300">{auditResult.cryptography.txHash}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
