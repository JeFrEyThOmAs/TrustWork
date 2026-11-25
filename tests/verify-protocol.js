import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { app } from '../server/index.js';
import { seedIfEmpty } from '../server/seed.js';

/**
 * Dispatches HTTP requests directly through the Express app router in-memory
 * so E2E verification runs deterministically even in socket-restricted sandboxes.
 */
function request(path, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const payloadStr = body ? JSON.stringify(body) : '';
    const req = new Readable({
      read() {
        if (payloadStr) this.push(Buffer.from(payloadStr, 'utf8'));
        this.push(null);
      },
    });
    req.url = path;
    req.originalUrl = path;
    req.method = method;
    req.headers = {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payloadStr, 'utf8')),
    };
    req.body = body || {};
    req._body = true;
    req.connection = { destroy() {} };
    req.socket = { destroy() {}, remoteAddress: '127.0.0.1' };

    const resHeaders = {};
    const chunks = [];
    const res = {
      statusCode: 200,
      setHeader(k, v) {
        resHeaders[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return resHeaders[k.toLowerCase()];
      },
      removeHeader(k) {
        delete resHeaders[k.toLowerCase()];
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      write(chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        return true;
      },
      end(chunk) {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          const parsed = raw ? JSON.parse(raw) : {};
          if (this.statusCode >= 400) {
            console.error(`HTTP ${this.statusCode} on ${method} ${path}:`, parsed);
          }
          resolve({ status: this.statusCode, json: parsed });
        } catch (err) {
          reject(new Error(`Invalid JSON response (${this.statusCode}): ${raw}`));
        }
      },
    };

    app.handle(req, res, (err) => {
      if (err) reject(err);
    });
  });
}

async function main() {
  await seedIfEmpty();

  console.log('1. Verifying /api/bootstrap & Embedded EVM status...');
  const boot = await request('/api/bootstrap');
  assert.equal(boot.status, 200);
  assert.ok(boot.json.chainStatus.contractAddress.startsWith('0x'));
  assert.ok(boot.json.identities.length >= 4);

  const acme = boot.json.identities.find((i) => i.name === 'Acme Corp');
  const arjun = boot.json.identities.find((i) => i.name === 'Arjun Verma');
  assert.ok(acme && arjun);

  console.log('2. Testing Dual-Signed Digital Agreement Creation (v1 Draft -> Co-Sign -> EVM Anchor)...');
  const draftRes = await request('/api/agreements', {
    method: 'POST',
    body: {
      title: 'E2E Test — Layer-2 Bridge Verifier',
      summary: 'Automated E2E verification agreement.',
      category: 'Smart Contracts',
      clientDid: acme.did,
      freelancerDid: arjun.did,
      proposedByDid: acme.did,
      startDate: '2026-12-01',
      deadline: '2026-12-15',
      durationDays: 14,
      totalCost: 300000,
      currency: 'INR',
      paymentSchedule: '100% On Completion',
      features: [
        {
          name: 'Merkle Proof Verifier',
          description: 'Solidity proof checker',
          acceptanceCriteria: 'Gas < 80k',
        },
      ],
      milestones: [
        {
          title: 'Milestone 1: Verifier Contract',
          deliverables: 'Solidity source & tests',
          dueDate: '2026-12-15',
          amount: 300000,
        },
      ],
    },
  });
  assert.equal(draftRes.status, 201);
  const v1Id = draftRes.json.agreementId;

  const cosignRes = await request(`/api/agreements/${v1Id}/cosign`, {
    method: 'POST',
    body: { actorDid: arjun.did },
  });
  assert.equal(cosignRes.status, 200);
  assert.equal(cosignRes.json.status, 'ACTIVE');
  console.log(`   ✓ Anchored v1 Agreement at Block #${cosignRes.json.receipt.blockNumber}`);

  console.log('3. Testing Unilateral Tamper Rejection (Single-Party Modification Attack)...');
  const tamperRes = await request(`/api/agreements/${v1Id}/simulate-tamper`, {
    method: 'POST',
    body: {
      attackerDid: acme.did,
      tamperedCost: 50000,
      tamperedDeadline: '2026-12-02',
    },
  });
  assert.equal(tamperRes.status, 200);
  assert.equal(tamperRes.json.tamperBlocked, true);
  assert.equal(tamperRes.json.onChainHashMatches, false);
  assert.match(tamperRes.json.evmContractResponse, /InvalidFreelancerSignature/);
  console.log(`   ✓ Unilateral tamper blocked: ${tamperRes.json.evmContractResponse}`);

  console.log('4. Testing Mutual Amendment Flow (Propose v2 -> Parent v1 stays ACTIVE -> Co-Sign v2 -> v1 SUPERSEDED)...');
  const amendProp = await request(`/api/agreements/${v1Id}/propose-amendment`, {
    method: 'POST',
    body: {
      proposedByDid: acme.did,
      deadline: '2026-12-25',
      durationDays: 24,
      totalCost: 450000,
      amendmentReason: 'Mutual expansion: Added ZK proof batching (+₹1,50,000 and +10 days)',
      features: [
        {
          name: 'Merkle Proof Verifier',
          description: 'Solidity proof checker',
          acceptanceCriteria: 'Gas < 80k',
        },
        {
          name: 'ZK Batch Aggregator',
          description: 'Batch 32 proofs per tx',
          acceptanceCriteria: 'Verified on Cancun EVM',
        },
      ],
      milestones: [
        {
          title: 'Milestone 1: Verifier + ZK Batcher',
          deliverables: 'Full contracts & tests',
          dueDate: '2026-12-25',
          amount: 450000,
        },
      ],
    },
  });
  assert.equal(amendProp.status, 201);
  const v2Id = amendProp.json.newAgreementId;

  // Verify v1 is STILL ACTIVE before Arjun co-signs!
  const midBoot = await request('/api/bootstrap');
  const v1Mid = midBoot.json.agreements.find((a) => a.id === v1Id);
  assert.equal(v1Mid.status, 'ACTIVE');

  // Now Arjun co-signs v2!
  const amendCosign = await request(`/api/agreements/${v2Id}/cosign-amendment`, {
    method: 'POST',
    body: { actorDid: arjun.did },
  });
  assert.equal(amendCosign.status, 200);
  assert.equal(amendCosign.json.version, 2);
  console.log(`   ✓ Mutual Amendment v2 anchored at Block #${amendCosign.json.receipt.blockNumber}`);

  const afterBoot = await request('/api/bootstrap');
  const v1After = afterBoot.json.agreements.find((a) => a.id === v1Id);
  const v2After = afterBoot.json.agreements.find((a) => a.id === v2Id);
  assert.equal(v1After.status, 'SUPERSEDED');
  assert.equal(v1After.supersededById, v2Id);
  assert.equal(v2After.status, 'ACTIVE');

  console.log('5. Testing Milestone Deliverable Proof Submission & Client Sign-Off...');
  const m1 = v2After.milestones[0];
  const subEv = await request(`/api/milestones/${m1.id}/submit-evidence`, {
    method: 'POST',
    body: {
      actorDid: arjun.did,
      commitHash: '77fa9012bc341190ea812390cc451289ab0012cd',
      repoUrl: 'https://github.com/zkshield/bridge-verifier/commit/77fa901',
      evidenceNotes: 'All 64 fuzz tests green.',
    },
  });
  assert.equal(subEv.status, 200);

  const signOff = await request(`/api/milestones/${m1.id}/sign-off`, {
    method: 'POST',
    body: { actorDid: acme.did },
  });
  assert.equal(signOff.status, 200);
  assert.equal(signOff.json.agreementCompleted, true);
  console.log('   ✓ Milestone verified & Agreement marked COMPLETED');

  console.log('6. Testing W3C Verifiable Credential Issuance, 1-Sec Audit, 1-Char Tamper Detection & On-Chain Revocation...');
  const vcRes = await request('/api/credentials/issue', {
    method: 'POST',
    body: {
      agreementId: v2Id,
      issuerDid: acme.did,
      rolePerformed: 'Lead Protocol Auditor',
      summaryStatement: 'Arjun delivered the Layer-2 Bridge Verifier & ZK Batch Aggregator.',
      skillsVerified: ['Solidity', 'ZK Proofs'],
      rating: 5,
    },
  });
  assert.equal(vcRes.status, 201);
  const credId = vcRes.json.credentialId;
  const vcDoc = vcRes.json.vcDocument;

  const auditPass = await request('/api/verify', {
    method: 'POST',
    body: { mode: 'credential', targetId: credId, documentJson: vcDoc },
  });
  assert.equal(auditPass.json.verified, true);
  console.log(`   ✓ Authentic W3C VC verified in ${auditPass.json.auditDurationMs}ms`);

  const forgedDoc = structuredClone(vcDoc);
  forgedDoc.credentialSubject.statement += '!';
  const auditTamper = await request('/api/verify', {
    method: 'POST',
    body: { mode: 'credential', targetId: credId, documentJson: forgedDoc },
  });
  assert.equal(auditTamper.json.verified, false);
  assert.equal(auditTamper.json.checks.payloadIntegrityIntact, false);
  console.log('   ✓ Single-character tamper immediately detected via Keccak-256 mismatch');

  const revokeRes = await request(`/api/credentials/${credId}/revoke`, {
    method: 'POST',
    body: { actorDid: acme.did, reason: 'E2E test revocation check' },
  });
  assert.equal(revokeRes.status, 200);

  const auditRevoked = await request('/api/verify', {
    method: 'POST',
    body: { mode: 'credential', targetId: credId, documentJson: vcDoc },
  });
  assert.equal(auditRevoked.json.verified, false);
  assert.equal(auditRevoked.json.checks.notRevoked, false);
  console.log('   ✓ On-Chain Revocation Registry verified');

  console.log('\nALL TRUSTWORK SMART CONTRACT & PROTOCOL CHECKS PASSED!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
