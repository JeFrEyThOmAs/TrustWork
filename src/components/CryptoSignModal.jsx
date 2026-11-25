import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { KeyRound, Copy, Download, Eye, EyeOff, Check, AlertCircle, Upload } from 'lucide-react';
import { apiFetch, shortHex, signDigestWithBrowserWallet } from '../lib/wallet.js';

/**
 * Displays the logged-in user's own Public DID, Public Key, and Private Signing Key
 * so each party can copy or download their cryptographic keyfile.
 */
export function KeypairVaultModal({ onClose, showToast }) {
  const [keyData, setKeyData] = useState(null);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch('/api/auth/keypair')
      .then(setKeyData)
      .catch((err) => showToast(err.message, 'error'));
  }, []);

  function handleCopy() {
    if (!keyData?.privateKey) return;
    navigator.clipboard.writeText(keyData.privateKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadKeyfile() {
    if (!keyData) return;
    const content = JSON.stringify(
      {
        platform: 'TrustWork',
        name: keyData.name,
        did: keyData.did,
        address: keyData.address,
        publicKey: keyData.publicKey,
        privateKey: keyData.privateKey,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${keyData.name.toLowerCase().replace(/\s+/g, '-')}-trustwork.key.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
      <div className="bg-white border border-zinc-200 rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-start justify-between border-b border-zinc-200 pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-zinc-900" />
            <div>
              <h3 className="text-base font-semibold text-zinc-900">
                Your Cryptographic Keypair (secp256k1)
              </h3>
              <p className="text-xs text-zinc-500">
                Use your Private Signing Key to digitally sign agreements and modifications.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="ui-btn-secondary py-1 px-2.5 text-xs">
            Close
          </button>
        </div>

        {!keyData ? (
          <div className="py-8 text-center text-xs text-zinc-500">Loading keypair...</div>
        ) : (
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-medium text-zinc-700 mb-1">
                Public Decentralized Identifier (DID)
              </label>
              <div className="p-2.5 rounded bg-zinc-50 border border-zinc-200 font-mono break-all text-zinc-800">
                {keyData.did}
              </div>
            </div>

            {keyData.publicKey && (
              <div>
                <label className="block font-medium text-zinc-700 mb-1">
                  Public Key (secp256k1)
                </label>
                <div className="p-2.5 rounded bg-zinc-50 border border-zinc-200 font-mono break-all text-zinc-600 text-[11px]">
                  {keyData.publicKey}
                </div>
              </div>
            )}

            {keyData.usesExternalWallet ? (
              <div className="p-3 rounded bg-zinc-50 border border-zinc-200 text-zinc-700">
                This account is linked to an external browser wallet ({keyData.address}). Your private key stays inside MetaMask.
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-zinc-700">
                    Private Signing Key (Keep Confidential)
                  </label>
                  <button
                    type="button"
                    onClick={() => setReveal(!reveal)}
                    className="text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1 cursor-pointer"
                  >
                    {reveal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{reveal ? 'Hide' : 'Reveal'}</span>
                  </button>
                </div>
                <div className="p-2.5 rounded bg-zinc-950 text-emerald-400 font-mono break-all text-[11px]">
                  {reveal
                    ? keyData.privateKey
                    : '0x••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                </div>

                <div className="flex items-center gap-2 pt-3">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="ui-btn-primary flex-1 flex items-center justify-center gap-1.5"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied Private Key' : 'Copy Private Key'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadKeyfile}
                    className="ui-btn-secondary flex-1 flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .key.json</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Client-Side Cryptographic Signing Modal:
 * Displays the exact Keccak-256 hash & EIP-191 digest, requires the signer's Private Key
 * (or MetaMask), verifies mathematically in the browser that `Wallet(privKey).address === signerAddress`,
 * computes the 65-byte ECDSA signature locally, and passes only the signature to `onSigned(signatureHex)`.
 */
export function CryptoSignModal({
  title,
  subtitle,
  termsHash,
  signingDigest,
  signerUser,
  onCancel,
  onSigned,
}) {
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [loadingVaultKey, setLoadingVaultKey] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState('');

  const keyValidation = useMemo(() => {
    const trimmed = privateKeyInput.trim();
    if (!trimmed) return { state: 'empty', derivedAddress: null };
    try {
      const normalized = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
      const wallet = new ethers.Wallet(normalized);
      const matches =
        ethers.getAddress(wallet.address) === ethers.getAddress(signerUser.address);
      return {
        state: matches ? 'valid' : 'mismatch',
        derivedAddress: wallet.address,
        wallet,
      };
    } catch {
      return { state: 'invalid_format', derivedAddress: null };
    }
  }, [privateKeyInput, signerUser.address]);

  async function handleLoadAccountKey() {
    setError('');
    setLoadingVaultKey(true);
    try {
      const res = await apiFetch('/api/auth/keypair');
      if (res.privateKey) {
        setPrivateKeyInput(res.privateKey);
      } else {
        setError('This account uses an external browser wallet.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingVaultKey(false);
    }
  }

  function handleKeyfileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed.privateKey) {
          setPrivateKeyInput(parsed.privateKey);
          setError('');
        } else {
          setError('Invalid keyfile: missing privateKey field.');
        }
      } catch {
        setError('Could not parse .key.json file.');
      }
    };
    reader.readAsText(file);
  }

  async function handleConfirmSign(e) {
    e.preventDefault();
    setError('');
    setSigning(true);
    try {
      if (signerUser.usesExternalWallet) {
        const sig = await signDigestWithBrowserWallet(signerUser.address, signingDigest);
        await onSigned(sig);
        return;
      }

      if (keyValidation.state !== 'valid' || !keyValidation.wallet) {
        throw new Error(
          'Enter the valid Private Signing Key belonging to ' + signerUser.name
        );
      }

      const signatureHex = await keyValidation.wallet.signMessage(
        ethers.getBytes(signingDigest)
      );
      await onSigned(signatureHex);
    } catch (err) {
      setError(err.message);
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white border border-zinc-200 rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-start justify-between border-b border-zinc-200 pb-3">
          <div>
            <div className="text-[11px] font-mono uppercase text-zinc-500">
              Client-Side ECDSA Digital Signature
            </div>
            <h3 className="text-base font-semibold text-zinc-900 mt-0.5">{title}</h3>
            {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="ui-btn-secondary py-1 px-2.5 text-xs"
          >
            Cancel
          </button>
        </div>

        {/* Hash & Digest Proof Box */}
        <div className="p-3.5 rounded-md bg-zinc-950 text-zinc-300 font-mono text-[11px] space-y-1.5">
          <div>
            <span className="text-zinc-500">Required Signer: </span>
            <span className="text-white">{signerUser.name}</span> ({shortHex(signerUser.address, 10, 6)})
          </div>
          {termsHash && (
            <div className="break-all">
              <span className="text-zinc-500">Payload Keccak-256 Hash: </span>
              <span className="text-emerald-400">{termsHash}</span>
            </div>
          )}
          <div className="break-all">
            <span className="text-zinc-500">EIP-191 Signing Digest: </span>
            <span className="text-zinc-200">{signingDigest}</span>
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleConfirmSign} className="space-y-3 text-xs">
          {!signerUser.usesExternalWallet && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-medium text-zinc-800">
                  Enter Your Private Signing Key (0x...)
                </label>
                <div className="flex items-center gap-2.5">
                  <label className="text-zinc-600 hover:text-zinc-900 underline cursor-pointer inline-flex items-center gap-1">
                    <Upload className="w-3 h-3" />
                    <span>Upload .key.json</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleKeyfileUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={loadingVaultKey}
                    onClick={handleLoadAccountKey}
                    className="text-zinc-900 font-medium underline cursor-pointer"
                  >
                    {loadingVaultKey ? 'Loading...' : 'Auto-fill my key'}
                  </button>
                </div>
              </div>

              <input
                type="password"
                required
                placeholder="Paste your 64-byte hex private key (0x...)"
                value={privateKeyInput}
                onChange={(e) => setPrivateKeyInput(e.target.value)}
                className="ui-input font-mono text-xs"
              />

              {/* Live Mathematical Key Derivation Feedback */}
              {keyValidation.state === 'valid' && (
                <div className="mt-2 p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-1.5 text-[11px]">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Key verified: mathematically derives signer{' '}
                    <code className="font-mono">{shortHex(keyValidation.derivedAddress, 10, 6)}</code>
                  </span>
                </div>
              )}

              {keyValidation.state === 'mismatch' && (
                <div className="mt-2 p-2 rounded bg-red-50 border border-red-200 text-red-800 flex items-start gap-1.5 text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Wrong key! This private key derives{' '}
                    <code className="font-mono">{shortHex(keyValidation.derivedAddress, 10, 6)}</code>, which cannot sign on behalf of{' '}
                    <strong>{signerUser.name}</strong> (
                    <code className="font-mono">{shortHex(signerUser.address, 10, 6)}</code>).
                  </span>
                </div>
              )}

              {keyValidation.state === 'invalid_format' && (
                <div className="mt-2 text-[11px] text-red-600">
                  Invalid secp256k1 private key format (expected 64 hex characters).
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onCancel} className="ui-btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                signing ||
                (!signerUser.usesExternalWallet && keyValidation.state !== 'valid')
              }
              className="ui-btn-primary"
            >
              {signing
                ? 'Signing & Broadcasting...'
                : signerUser.usesExternalWallet
                  ? 'Sign with Browser Wallet'
                  : 'Sign Hash with Private Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
