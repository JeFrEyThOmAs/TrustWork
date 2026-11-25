import { ethers } from 'ethers';

export function shortHex(val, start = 8, end = 6) {
  if (!val) return '—';
  if (val.length <= start + end + 3) return val;
  return `${val.slice(0, start)}...${val.slice(-end)}`;
}

export function formatCurrency(amount, currency = 'INR') {
  const num = Number(amount || 0);
  if (currency === 'INR') {
    return `₹${num.toLocaleString('en-IN')}`;
  }
  if (currency === 'USD') {
    return `$${num.toLocaleString('en-US')}`;
  }
  return `${num} ${currency}`;
}

export function tierMeta(tier) {
  switch (tier) {
    case 'ENTERPRISE':
      return {
        label: 'ENTERPRISE VERIFIED',
        bg: 'bg-sky-100 text-sky-900 border-sky-800',
        dot: 'bg-sky-600',
      };
    case 'VERIFIED_ORG':
      return {
        label: 'VERIFIED ORG',
        bg: 'bg-amber-100 text-amber-900 border-amber-800',
        dot: 'bg-amber-500',
      };
    case 'PLATFORM':
      return {
        label: 'TRUSTED PLATFORM',
        bg: 'bg-purple-100 text-purple-900 border-purple-800',
        dot: 'bg-purple-600',
      };
    default:
      return {
        label: 'SELF-SOVEREIGN ID',
        bg: 'bg-slate-100 text-slate-800 border-slate-700',
        dot: 'bg-slate-500',
      };
  }
}

export function statusBadge(status) {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-100 text-emerald-900 border-emerald-800';
    case 'COMPLETED':
      return 'bg-sky-100 text-sky-950 border-sky-900';
    case 'PENDING_SIGNATURES':
      return 'bg-amber-100 text-amber-950 border-amber-900';
    case 'AMENDMENT_PENDING':
      return 'bg-rose-100 text-rose-950 border-rose-900';
    case 'SUPERSEDED':
      return 'bg-slate-200 text-slate-700 border-slate-600';
    case 'REJECTED':
      return 'bg-red-100 text-red-900 border-red-800';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-700';
  }
}

export async function connectBrowserWallet() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask / EIP-1193 browser wallet not detected. You can also generate a built-in Self-Controlled DID Keypair!');
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { address, signer };
}

export async function signDigestWithBrowserWallet(expectedAddress, digestHex) {
  const { address, signer } = await connectBrowserWallet();
  if (ethers.getAddress(address) !== ethers.getAddress(expectedAddress)) {
    throw new Error(
      `Active MetaMask account (${shortHex(address)}) does not match DID controller (${shortHex(expectedAddress)})`
    );
  }
  return signer.signMessage(ethers.getBytes(digestHex));
}

export async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}
