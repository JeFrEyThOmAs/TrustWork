import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { app } from '../server/index.js';
import { seedIfEmpty } from '../server/seed.js';

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

  console.log('1. Verifying Marketplace Bootstrap & Unified Freelancer/Client Accounts...');
  const boot = await request('/api/bootstrap');
  assert.equal(boot.status, 200);
  assert.ok(boot.json.identities.length >= 5);
  assert.ok(boot.json.gigs.length >= 4);

  const mili = boot.json.identities.find((u) => u.email === 'mili@trustwork.io');
  const arjun = boot.json.identities.find((u) => u.email === 'arjun@zkshield.dev');
  assert.ok(mili && arjun);

  console.log('2. Testing Unified Role: Mili posts a Gig as Gig Provider -> Arjun submits Proposal as Freelancer...');
  const gigRes = await request('/api/gigs', {
    method: 'POST',
    body: {
      posterDid: mili.did,
      title: 'Build WebSocket Metrics Collector & Alerting SDK',
      description: 'Need a low-overhead TypeScript SDK & ingestion endpoint.',
      category: 'Full-Stack Development',
      budgetMin: 180000,
      budgetMax: 240000,
      currency: 'INR',
      durationDays: 14,
      deadline: '2026-12-18',
      skills: ['TypeScript', 'Node.js', 'WebSockets'],
      features: [
        { name: 'Streaming SDK', acceptanceCriteria: '<2ms client overhead' },
      ],
    },
  });
  assert.equal(gigRes.status, 201);
  const gigId = gigRes.json.gigId;

  const propRes = await request(`/api/gigs/${gigId}/proposals`, {
    method: 'POST',
    body: {
      freelancerDid: arjun.did,
      coverLetter: 'I can ship the TypeScript SDK + tests in 12 days.',
      proposedCost: 200000,
      currency: 'INR',
      proposedDurationDays: 12,
      proposedDeadline: '2026-12-16',
      proposedFeatures: [
        {
          name: 'Streaming SDK',
          description: 'Typed WebSocket client',
          acceptanceCriteria: '<2ms overhead',
        },
      ],
      proposedMilestones: [
        {
          title: 'Milestone 1: Complete SDK & Tests',
          deliverables: 'NPM package + unit tests',
          dueDate: '2026-12-16',
          amount: 200000,
        },
      ],
    },
  });
  assert.equal(propRes.status, 201);

  console.log('3. Testing Proposal Acceptance -> Dual-Signed Digital Agreement v1 Anchored on Blockchain...');
  const acceptRes = await request(`/api/proposals/${propRes.json.proposalId}/accept`, {
    method: 'POST',
    body: { actorDid: mili.did },
  });
  assert.equal(acceptRes.status, 201);
  const v1Id = acceptRes.json.agreementId;

  const cosignRes = await request(`/api/agreements/${v1Id}/cosign`, {
    method: 'POST',
    body: { actorDid: arjun.did },
  });
  assert.equal(cosignRes.status, 200);
  assert.equal(cosignRes.json.status, 'ACTIVE');
  console.log(`   ✓ Digital Agreement v1 co-signed & anchored at Block #${cosignRes.json.receipt.blockNumber}`);

  console.log('4. Testing Unilateral Tamper Protection (Single-Party Edit Blocked by Smart Contract)...');
  const tamperRes = await request(`/api/agreements/${v1Id}/simulate-tamper`, {
    method: 'POST',
    body: {
      attackerDid: mili.did,
      tamperedCost: 40000,
      tamperedDeadline: '2026-12-03',
    },
  });
  assert.equal(tamperRes.status, 200);
  assert.equal(tamperRes.json.tamperBlocked, true);
  assert.equal(tamperRes.json.onChainHashMatches, false);
  assert.match(tamperRes.json.evmContractResponse, /InvalidFreelancerSignature/);
  console.log(`   ✓ Unilateral edit blocked: ${tamperRes.json.evmContractResponse}`);

  console.log('5. Testing Mutual Agreement Modification (Both Parties Sign -> Mints New Agreement v2)...');
  const amendProp = await request(`/api/agreements/${v1Id}/propose-amendment`, {
    method: 'POST',
    body: {
      proposedByDid: mili.did,
      deadline: '2026-12-24',
      durationDays: 20,
      totalCost: 280000,
      amendmentReason: 'Added Prometheus exporter feature (+₹80,000 and +8 days)',
      features: [
        { name: 'Streaming SDK', description: 'Typed WebSocket client', acceptanceCriteria: '<2ms overhead' },
        { name: 'Prometheus Metrics Exporter', description: 'OpenMetrics endpoint', acceptanceCriteria: 'Grafana ready' },
      ],
      milestones: [
        {
          title: 'Milestone 1: SDK + Prometheus Exporter',
          deliverables: 'Full source + tests',
          dueDate: '2026-12-24',
          amount: 280000,
        },
      ],
    },
  });
  assert.equal(amendProp.status, 201);
  const v2Id = amendProp.json.newAgreementId;

  const amendCosign = await request(`/api/agreements/${v2Id}/cosign-amendment`, {
    method: 'POST',
    body: { actorDid: arjun.did },
  });
  assert.equal(amendCosign.status, 200);
  assert.equal(amendCosign.json.version, 2);
  console.log(`   ✓ Mutual Modification v2 anchored at Block #${amendCosign.json.receipt.blockNumber}`);

  const postAmendBoot = await request('/api/bootstrap');
  const v2Ag = postAmendBoot.json.agreements.find((a) => a.id === v2Id);
  assert.equal(v2Ag.status, 'ACTIVE');

  console.log('6. Testing Deliverable Submission, Milestone Sign-Off, W3C Credential & 1-Sec Verification...');
  const ms1 = v2Ag.milestones[0];
  await request(`/api/milestones/${ms1.id}/submit-evidence`, {
    method: 'POST',
    body: {
      actorDid: arjun.did,
      commitHash: '91ab44cd0019ef882310aa77bc1290ff118823cc',
      repoUrl: 'https://github.com/arjun/metrics-sdk/commit/91ab44c',
      evidenceNotes: 'Delivered SDK + Prometheus exporter.',
    },
  });

  const signOff = await request(`/api/milestones/${ms1.id}/sign-off`, {
    method: 'POST',
    body: { actorDid: mili.did },
  });
  assert.equal(signOff.status, 200);
  assert.equal(signOff.json.agreementCompleted, true);

  const vcRes = await request('/api/credentials/issue', {
    method: 'POST',
    body: {
      agreementId: v2Id,
      issuerDid: mili.did,
      rolePerformed: 'Lead TypeScript SDK Engineer',
      summaryStatement: 'Arjun delivered the WebSocket Metrics SDK and Prometheus exporter.',
      skillsVerified: ['TypeScript', 'Node.js'],
      rating: 5,
    },
  });
  assert.equal(vcRes.status, 201);

  const verifyPass = await request('/api/verify', {
    method: 'POST',
    body: {
      mode: 'credential',
      targetId: vcRes.json.credentialId,
      documentJson: vcRes.json.vcDocument,
    },
  });
  assert.equal(verifyPass.json.verified, true);
  console.log(`   ✓ Portable W3C Credential verified in ${verifyPass.json.auditDurationMs}ms`);

  console.log('\nALL TRUSTWORK FREELANCE MARKETPLACE & BLOCKCHAIN CHECKS PASSED!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
