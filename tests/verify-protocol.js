import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { app } from '../server/index.js';

function request(path, { method = 'GET', token = '', body } = {}) {
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
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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
          if (this.statusCode >= 400 && this.statusCode !== 401) {
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
  console.log('1. Verifying unauthenticated requests are rejected (401)...');
  const unauth = await request('/api/bootstrap');
  assert.equal(unauth.status, 401);

  console.log('2. Browser 1: Registering User A (Gig Provider) & verifying login...');
  const regA = await request('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Client User A',
      email: 'client.a@example.com',
      password: 'strongpassword123',
      headline: 'Engineering Manager',
      organization: 'Vertex Systems',
      issuerTier: 'VERIFIED_ORG',
      skills: ['System Architecture'],
    },
  });
  assert.equal(regA.status, 201);
  const tokenA = regA.json.token;

  const loginFail = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'client.a@example.com', password: 'wrongpassword' },
  });
  assert.equal(loginFail.status, 401);

  const loginOk = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'client.a@example.com', password: 'strongpassword123' },
  });
  assert.equal(loginOk.status, 200);

  console.log('3. Browser 1: User A posts a Gig...');
  const gigRes = await request('/api/gigs', {
    method: 'POST',
    token: tokenA,
    body: {
      title: 'Distributed Payment Webhook Service',
      description: 'Build an idempotent Go webhook dispatcher with PostgreSQL persistence.',
      category: 'Backend & Systems',
      budgetMin: 90000,
      budgetMax: 140000,
      currency: 'INR',
      durationDays: 14,
      deadline: '2026-12-20',
      skills: ['Go', 'PostgreSQL'],
      features: [{ name: 'Webhook Retry Engine', acceptanceCriteria: 'Zero duplicate deliveries' }],
    },
  });
  assert.equal(gigRes.status, 201);
  const gigId = gigRes.json.gigId;

  console.log('4. Browser 2: Registering User B (Freelancer) -> sees User A gig immediately -> applies...');
  const regB = await request('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Freelancer User B',
      email: 'freelancer.b@example.com',
      password: 'freelancerpassword123',
      headline: 'Senior Backend Engineer',
      skills: ['Go', 'PostgreSQL', 'Docker'],
    },
  });
  assert.equal(regB.status, 201);
  const tokenB = regB.json.token;

  const bootB = await request('/api/bootstrap', { token: tokenB });
  assert.equal(bootB.status, 200);
  assert.equal(bootB.json.gigs.length, 1);
  assert.equal(bootB.json.gigs[0].id, gigId);

  const propRes = await request(`/api/gigs/${gigId}/proposals`, {
    method: 'POST',
    token: tokenB,
    body: {
      coverLetter: 'I can deliver the Go webhook service with full integration tests in 12 days.',
      proposedCost: 120000,
      currency: 'INR',
      proposedDurationDays: 12,
      proposedDeadline: '2026-12-18',
    },
  });
  assert.equal(propRes.status, 201);

  console.log('5. Browser 1 (User A) hires User B -> Browser 2 (User B) co-signs -> Anchored on Blockchain...');
  const acceptRes = await request(`/api/proposals/${propRes.json.proposalId}/accept`, {
    method: 'POST',
    token: tokenA,
    body: {},
  });
  assert.equal(acceptRes.status, 201);
  const v1Id = acceptRes.json.agreementId;

  const cosignRes = await request(`/api/agreements/${v1Id}/cosign`, {
    method: 'POST',
    token: tokenB,
    body: {},
  });
  assert.equal(cosignRes.status, 200);
  assert.equal(cosignRes.json.status, 'ACTIVE');
  console.log(`   ✓ Agreement v1 anchored at Block #${cosignRes.json.receipt.blockNumber}`);

  console.log('6. Verifying Unilateral Tamper Protection & Mutual Modification (v1 -> v2)...');
  const tamperRes = await request(`/api/agreements/${v1Id}/simulate-tamper`, {
    method: 'POST',
    token: tokenA,
    body: { tamperedCost: 10000, tamperedDeadline: '2026-12-01' },
  });
  assert.equal(tamperRes.json.tamperBlocked, true);
  assert.match(tamperRes.json.evmContractResponse, /InvalidFreelancerSignature/);

  const modProp = await request(`/api/agreements/${v1Id}/propose-amendment`, {
    method: 'POST',
    token: tokenA,
    body: {
      totalCost: 160000,
      deadline: '2026-12-26',
      durationDays: 20,
      amendmentReason: 'Added Prometheus metrics endpoint (+INR 40,000)',
      features: [
        { name: 'Webhook Retry Engine', description: '', acceptanceCriteria: 'Zero duplicates' },
        { name: 'Prometheus Exporter', description: '', acceptanceCriteria: 'Metrics live' },
      ],
      milestones: [
        { title: 'Milestone 1: Core + Metrics', deliverables: 'Go service', dueDate: '2026-12-26', amount: 160000 },
      ],
    },
  });
  assert.equal(modProp.status, 201);
  const v2Id = modProp.json.newAgreementId;

  const modCosign = await request(`/api/agreements/${v2Id}/cosign-amendment`, {
    method: 'POST',
    token: tokenB,
    body: {},
  });
  assert.equal(modCosign.status, 200);
  assert.equal(modCosign.json.version, 2);
  console.log(`   ✓ Mutual Modification v2 anchored at Block #${modCosign.json.receipt.blockNumber}`);

  console.log('7. Verifying Milestone Submission, Client Approval & W3C Credential Verification...');
  const bootAfter = await request('/api/bootstrap', { token: tokenB });
  const v2Ag = bootAfter.json.agreements.find((a) => a.id === v2Id);
  const ms1 = v2Ag.milestones[0];

  await request(`/api/milestones/${ms1.id}/submit-evidence`, {
    method: 'POST',
    token: tokenB,
    body: {
      commitHash: 'b8291fa03912cd8812390aa7712e9031ca551109',
      repoUrl: 'https://github.com/example/webhook-service/commit/b8291fa',
      evidenceNotes: 'All integration tests passing.',
    },
  });

  const signOff = await request(`/api/milestones/${ms1.id}/sign-off`, {
    method: 'POST',
    token: tokenA,
    body: {},
  });
  assert.equal(signOff.status, 200);

  const vcRes = await request('/api/credentials/issue', {
    method: 'POST',
    token: tokenA,
    body: {
      agreementId: v2Id,
      rolePerformed: 'Lead Backend Engineer',
      summaryStatement: 'Delivered Distributed Payment Webhook Service & Prometheus Exporter.',
      skillsVerified: ['Go', 'PostgreSQL'],
      rating: 5,
    },
  });
  assert.equal(vcRes.status, 201);

  const pubAudit = await request('/api/verify', {
    method: 'POST',
    body: {
      mode: 'credential',
      targetId: vcRes.json.credentialId,
      documentJson: vcRes.json.vcDocument,
    },
  });
  assert.equal(pubAudit.json.verified, true);

  console.log('\nALL MULTI-SESSION AUTH, MARKETPLACE & BLOCKCHAIN AGREEMENT TESTS PASSED!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
