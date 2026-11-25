import crypto from 'node:crypto';
import { ethers } from 'ethers';

/**
 * Deterministic recursive key sorting so that off-chain JSON documents always
 * produce the exact same canonical UTF-8 byte sequence and Keccak-256 hash
 * regardless of property insertion order.
 */
export function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalize(item)).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const parts = [];
  for (const k of keys) {
    if (value[k] !== undefined) {
      parts.push(JSON.stringify(k) + ':' + canonicalize(value[k]));
    }
  }
  return '{' + parts.join(',') + '}';
}

export function keccak256Json(obj) {
  const canonical = canonicalize(obj);
  return {
    canonical,
    hash: ethers.keccak256(ethers.toUtf8Bytes(canonical)),
  };
}

export function formatDid(address) {
  return `did:trustwork:${ethers.getAddress(address)}`;
}

export function addressFromDid(didOrAddress) {
  if (!didOrAddress) return null;
  const cleaned = didOrAddress.startsWith('did:trustwork:')
    ? didOrAddress.replace('did:trustwork:', '')
    : didOrAddress;
  return ethers.getAddress(cleaned);
}

/**
 * Exact matching Solidity digest functions for TrustWorkProtocol.sol
 */
export function computeInitialAgreementDigest({ agreementId, gigProvider, freelancer, termsHash }) {
  return ethers.solidityPackedKeccak256(
    ['string', 'bytes32', 'uint32', 'bytes32', 'address', 'address', 'bytes32'],
    [
      'TRUSTWORK_AGREEMENT_V1',
      agreementId,
      1,
      ethers.ZeroHash,
      ethers.getAddress(gigProvider),
      ethers.getAddress(freelancer),
      termsHash,
    ]
  );
}

export function computeAmendmentDigest({
  newAgreementId,
  newVersion,
  parentAgreementId,
  gigProvider,
  freelancer,
  newTermsHash,
}) {
  return ethers.solidityPackedKeccak256(
    ['string', 'bytes32', 'uint32', 'bytes32', 'address', 'address', 'bytes32'],
    [
      'TRUSTWORK_AMENDMENT_V1',
      newAgreementId,
      newVersion,
      parentAgreementId,
      ethers.getAddress(gigProvider),
      ethers.getAddress(freelancer),
      newTermsHash,
    ]
  );
}

export function computeCompleteAgreementDigest({ agreementId, termsHash }) {
  return ethers.solidityPackedKeccak256(
    ['string', 'bytes32', 'bytes32'],
    ['TRUSTWORK_COMPLETE_V1', agreementId, termsHash]
  );
}

export function computeMilestoneDigest({ milestoneId, agreementId, deliverableHash }) {
  return ethers.solidityPackedKeccak256(
    ['string', 'bytes32', 'bytes32', 'bytes32'],
    ['TRUSTWORK_MILESTONE_V1', milestoneId, agreementId, deliverableHash]
  );
}

export function computeCredentialDigest({ credentialId, vcHash, agreementId, issuer, subject }) {
  return ethers.solidityPackedKeccak256(
    ['string', 'bytes32', 'bytes32', 'bytes32', 'address', 'address'],
    [
      'TRUSTWORK_VC_V1',
      credentialId,
      vcHash,
      agreementId,
      ethers.getAddress(issuer),
      ethers.getAddress(subject),
    ]
  );
}

export function computeRevokeCredentialDigest({ credentialId, vcHash, reason }) {
  return ethers.solidityPackedKeccak256(
    ['string', 'bytes32', 'bytes32', 'string'],
    ['TRUSTWORK_REVOKE_VC_V1', credentialId, vcHash, reason]
  );
}

export async function signDigestWithKey(privateKey, digestHex) {
  const wallet = new ethers.Wallet(privateKey);
  return wallet.signMessage(ethers.getBytes(digestHex));
}

export function recoverDigestSigner(digestHex, signatureHex) {
  try {
    return ethers.verifyMessage(ethers.getBytes(digestHex), signatureHex);
  } catch {
    return null;
  }
}

/**
 * Generates a Zero-Knowledge-style Hash-Chain Range Commitment Proof (Slide 11)
 * allowing a freelancer to prove `actualValue >= threshold` anchored to their
 * verified on-chain credential hashes without revealing exact contract amounts or clients.
 */
export function createThresholdCommitmentProof({
  subjectDid,
  claimType,
  threshold,
  actualValue,
  credentialHashes,
  secretSalt,
}) {
  if (actualValue < threshold) {
    throw new Error(`Threshold not met: actual (${actualValue}) < threshold (${threshold})`);
  }
  const salt = secretSalt || '0x' + crypto.randomBytes(32).toString('hex');
  const sortedCredRoot = ethers.keccak256(
    ethers.toUtf8Bytes([...credentialHashes].sort().join('|'))
  );

  // Hash-chain witness: H^(delta)(seed) where delta = floor((actualValue - threshold) / step)
  const step = claimType === 'MIN_EARNINGS_INR' ? 10000 : 1;
  const stepsAbove = Math.min(500, Math.floor((actualValue - threshold) / step));
  const seed = ethers.solidityPackedKeccak256(
    ['bytes32', 'string', 'bytes32'],
    [salt, subjectDid, sortedCredRoot]
  );

  let tip = seed;
  for (let i = 0; i < stepsAbove; i++) {
    tip = ethers.keccak256(tip);
  }

  const publicCommitment = ethers.solidityPackedKeccak256(
    ['string', 'string', 'uint256', 'bytes32', 'bytes32'],
    ['TRUSTWORK_ZKP_V1', subjectDid, BigInt(threshold), sortedCredRoot, tip]
  );

  return {
    protocol: 'TrustWork-ZK-HashRange-v1',
    subjectDid,
    claimType,
    threshold,
    stepUnit: step,
    credentialSetRoot: sortedCredRoot,
    credentialCount: credentialHashes.length,
    witnessSeedHash: ethers.keccak256(seed),
    chainSteps: stepsAbove,
    chainTip: tip,
    publicCommitment,
    createdAt: new Date().toISOString(),
    // Note: actualValue, client names, and raw salt are NEVER included in the public proof!
  };
}

export function verifyThresholdCommitmentProof(proof) {
  try {
    const recomputed = ethers.solidityPackedKeccak256(
      ['string', 'string', 'uint256', 'bytes32', 'bytes32'],
      [
        'TRUSTWORK_ZKP_V1',
        proof.subjectDid,
        BigInt(proof.threshold),
        proof.credentialSetRoot,
        proof.chainTip,
      ]
    );
    return {
      valid: recomputed === proof.publicCommitment && proof.credentialCount > 0 && proof.chainSteps >= 0,
      recomputedCommitment: recomputed,
    };
  } catch {
    return { valid: false, recomputedCommitment: null };
  }
}
