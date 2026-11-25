import { ethers } from 'ethers';

export function shortHex(val, start = 8, end = 6) {
  if (!val) return '—';
  if (val.length <= start + end + 3) return val;
  return `${val.slice(0, start)}...${val.slice(-end)}`;
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function formatCurrency(amount, currency = 'INR') {
  const num = Number(amount || 0);
  if (currency === 'INR') return `₹${num.toLocaleString('en-IN')}`;
  if (currency === 'USD') return `$${num.toLocaleString('en-US')}`;
  return `${num} ${currency}`;
}

export function tierMeta(tier) {
  switch (tier) {
    case 'ENTERPRISE':
      return {
        label: 'Enterprise Verified',
        badge: 'bg-sky-50 text-sky-700 border-sky-200',
      };
    case 'VERIFIED_ORG':
      return {
        label: 'Verified Company',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'PLATFORM':
      return {
        label: 'Partner Platform',
        badge: 'bg-purple-50 text-purple-700 border-purple-200',
      };
    default:
      return {
        label: 'Verified Individual',
        badge: 'bg-slate-100 text-slate-700 border-slate-200',
      };
  }
}

export function agreementStatusMeta(status) {
  switch (status) {
    case 'ACTIVE':
      return {
        label: 'Active On-Chain',
        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'COMPLETED':
      return {
        label: 'Completed',
        cls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      };
    case 'PENDING_SIGNATURES':
      return {
        label: 'Awaiting Co-Signature',
        cls: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'AMENDMENT_PENDING':
      return {
        label: 'Change Request Pending',
        cls: 'bg-rose-50 text-rose-700 border-rose-200',
      };
    case 'SUPERSEDED':
      return {
        label: 'Superseded Version',
        cls: 'bg-slate-100 text-slate-600 border-slate-200',
      };
    case 'REJECTED':
      return {
        label: 'Declined',
        cls: 'bg-red-50 text-red-700 border-red-200',
      };
    default:
      return {
        label: status,
        cls: 'bg-slate-100 text-slate-700 border-slate-200',
      };
  }
}

export async function connectBrowserWallet() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error(
      'MetaMask browser extension not detected. Leave wallet blank to generate an automatic blockchain keypair!'
    );
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
      `Connected wallet (${shortHex(address)}) does not match your account DID (${shortHex(expectedAddress)})`
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
