import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vaultDir = path.resolve(__dirname, '..', 'data', 'ipfs-vault');

// Base32 lowercase RFC4648 alphabet used by IPFS CIDv1 (bafkrei...)
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Computes a standards-compliant IPFS CIDv1 (raw codec 0x55, sha2-256 0x12, 32 bytes 0x20)
 * prefixed with multibase base32 'b' -> 'bafkrei...'
 */
export function computeIpfsCid(content) {
  const bytes = Buffer.isBuffer(content)
    ? content
    : Buffer.from(typeof content === 'string' ? content : JSON.stringify(content), 'utf8');
  const sha256Digest = crypto.createHash('sha256').update(bytes).digest();
  const cidBytes = Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), sha256Digest]);
  return 'b' + base32Encode(cidBytes);
}

export function pinToIpfsVault(payload, metadata = {}) {
  fs.mkdirSync(vaultDir, { recursive: true });
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  const cid = computeIpfsCid(serialized);
  const recordPath = path.join(vaultDir, `${cid}.json`);
  const envelope = {
    cid,
    pinnedAt: new Date().toISOString(),
    sizeBytes: Buffer.byteLength(serialized, 'utf8'),
    metadata,
    content: typeof payload === 'string' ? payload : JSON.parse(serialized),
  };
  fs.writeFileSync(recordPath, JSON.stringify(envelope, null, 2));
  return { cid, sizeBytes: envelope.sizeBytes };
}

export function getFromIpfsVault(cid) {
  const safeCid = path.basename(cid);
  const recordPath = path.join(vaultDir, `${safeCid}.json`);
  if (!fs.existsSync(recordPath)) return null;
  return JSON.parse(fs.readFileSync(recordPath, 'utf8'));
}
