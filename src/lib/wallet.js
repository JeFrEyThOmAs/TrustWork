import { ethers } from 'ethers';

const TOKEN_STORAGE_KEY = 'trustwork_session_token';

export function getStoredToken() {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredToken(token) {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

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
        label: 'Enterprise',
        badge: 'bg-zinc-900 text-white border-zinc-900',
      };
    case 'VERIFIED_ORG':
      return {
        label: 'Verified Org',
        badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'PLATFORM':
      return {
        label: 'Platform',
        badge: 'bg-zinc-100 text-zinc-800 border-zinc-300',
      };
    default:
      return {
        label: 'Individual',
        badge: 'bg-zinc-100 text-zinc-700 border-zinc-200',
      };
  }
}

export function agreementStatusMeta(status) {
  switch (status) {
    case 'ACTIVE':
      return {
        label: 'Active',
        cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'COMPLETED':
      return {
        label: 'Completed',
        cls: 'bg-zinc-900 text-white border-zinc-900',
      };
    case 'PENDING_SIGNATURES':
      return {
        label: 'Pending Signature',
        cls: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'AMENDMENT_PENDING':
      return {
        label: 'Modification Pending',
        cls: 'bg-amber-50 text-amber-900 border-amber-300',
      };
    case 'SUPERSEDED':
      return {
        label: 'Superseded',
        cls: 'bg-zinc-100 text-zinc-600 border-zinc-200',
      };
    case 'REJECTED':
      return {
        label: 'Declined',
        cls: 'bg-red-50 text-red-700 border-red-200',
      };
    default:
      return {
        label: status,
        cls: 'bg-zinc-100 text-zinc-700 border-zinc-200',
      };
  }
}

export async function connectBrowserWallet() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No browser wallet detected. Leave blank to generate a managed keypair.');
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
      `Active wallet (${shortHex(address)}) does not match registered DID (${shortHex(expectedAddress)})`
    );
  }
  return signer.signMessage(ethers.getBytes(digestHex));
}

export async function apiFetch(url, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
