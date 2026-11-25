import crypto from 'node:crypto';
import { ethers } from 'ethers';
import { chain } from './blockchain.js';
import {
  computeAmendmentDigest,
  computeCompleteAgreementDigest,
  computeCredentialDigest,
  computeInitialAgreementDigest,
  computeMilestoneDigest,
  createThresholdCommitmentProof,
  formatDid,
  keccak256Json,
  signDigestWithKey,
} from './crypto-utils.js';
import { db } from './db.js';
import { pinToIpfsVault } from './ipfs-vault.js';

const ISSUER_TIER_ENUM = {
  INDIVIDUAL: 0,
  VERIFIED_ORG: 1,
  ENTERPRISE: 2,
  PLATFORM: 3,
};

function hashPassword(pw) {
  return crypto.createHash('sha256').update(`trustwork:${pw}`).digest('hex');
}

const DEMO_USERS = [
  {
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    name: 'Mili Nair',
    headline: 'Principal Backend & FinTech Systems Architect',
    email: 'mili@trustwork.io',
    bio: '8+ years architecting payment engines, Rust/Go microservices, and high-throughput APIs. Open to freelance architecture contracts & also hiring UI/UX designers for my own SaaS tools.',
    role: 'BOTH',
    hourly_rate: 4500,
    location: 'Bengaluru, India',
    organization: 'Mili Systems Studio',
    domain: 'milinair.dev',
    issuer_tier: 'INDIVIDUAL',
    kyb_verified: 1,
    skills: ['Go', 'Rust', 'Distributed Systems', 'Payment Rails', 'PostgreSQL', 'Node.js'],
    avatar_color: '#4F46E5',
  },
  {
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    name: 'Rohan Mehta (Acme FinTech)',
    headline: 'VP of Engineering @ Acme Corp · Enterprise Gig Provider',
    email: 'rohan@acmecorp.io',
    bio: 'Hiring verified senior engineers, security auditors, and product designers for Acme Corp payment & cloud products.',
    role: 'BOTH',
    hourly_rate: 6000,
    location: 'Mumbai, India',
    organization: 'Acme Corporation Pvt. Ltd.',
    domain: 'acmecorp.io',
    issuer_tier: 'ENTERPRISE',
    kyb_verified: 1,
    skills: ['Cloud Architecture', 'FinTech', 'Product Strategy', 'System Design'],
    avatar_color: '#0284C7',
  },
  {
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    name: 'Ananya Rao (NovaFin Labs)',
    headline: 'CTO @ NovaFin Labs · AI & RegTech Builder',
    email: 'ananya@novafin.xyz',
    bio: 'Building real-time fraud & compliance APIs at NovaFin Labs. Hiring freelance engineers and taking advisory architecture sprints.',
    role: 'BOTH',
    hourly_rate: 5200,
    location: 'Hyderabad, India',
    organization: 'NovaFin Labs Inc.',
    domain: 'novafin.xyz',
    issuer_tier: 'VERIFIED_ORG',
    kyb_verified: 1,
    skills: ['Machine Learning', 'Python', 'RegTech', 'Graph Analytics', 'FastAPI'],
    avatar_color: '#059669',
  },
  {
    privateKey: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
    name: 'Arjun Verma',
    headline: 'Full-Stack Web3, React & Smart Contract Developer',
    email: 'arjun@zkshield.dev',
    bio: 'Full-stack TypeScript/React + Solidity engineer building DeFi dashboards, escrow contracts, and modern SaaS web apps.',
    role: 'BOTH',
    hourly_rate: 3800,
    location: 'Pune, India',
    organization: 'ZKShield Studio',
    domain: 'zkshield.dev',
    issuer_tier: 'INDIVIDUAL',
    kyb_verified: 1,
    skills: ['React', 'TypeScript', 'Solidity', 'Next.js', 'Tailwind CSS', 'Smart Contracts'],
    avatar_color: '#D97706',
  },
  {
    privateKey: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
    name: 'Sneha Kapoor',
    headline: 'Senior Product Designer & Design Systems Lead',
    email: 'sneha@kapoordesign.in',
    bio: 'Crafting high-converting SaaS interfaces, Figma component libraries, and interactive prototypes for global startups.',
    role: 'BOTH',
    hourly_rate: 3200,
    location: 'Delhi NCR, India',
    organization: 'Kapoor Design Co.',
    domain: 'kapoordesign.in',
    issuer_tier: 'INDIVIDUAL',
    kyb_verified: 1,
    skills: ['UI/UX Design', 'Figma', 'Design Systems', 'Prototyping', 'Frontend CSS'],
    avatar_color: '#E11D48',
  },
];

export function buildCanonicalAgreementPayload({
  version,
  parentAgreementId,
  title,
  summary,
  category,
  clientDid,
  freelancerDid,
  startDate,
  deadline,
  durationDays,
  totalCost,
  currency,
  paymentSchedule,
  features,
  milestones,
  clauses,
  amendmentReason,
}) {
  return {
    schema: 'trustwork.digital-agreement.v2',
    version: Number(version),
    parentAgreementId: parentAgreementId || null,
    title: String(title).trim(),
    summary: String(summary || '').trim(),
    category: String(category || 'Full-Stack Development').trim(),
    parties: {
      gigProviderDid: clientDid,
      freelancerDid: freelancerDid,
    },
    timeline: {
      startDate,
      deadline,
      durationDays: Number(durationDays),
    },
    compensation: {
      totalCost: Number(totalCost),
      currency: currency || 'INR',
      paymentSchedule: paymentSchedule || 'Milestone-Based',
    },
    features: (features || []).map((f, i) => ({
      index: i + 1,
      name: String(f.name).trim(),
      description: String(f.description || '').trim(),
      acceptanceCriteria: String(f.acceptanceCriteria || 'Meets agreed specification').trim(),
    })),
    milestones: (milestones || []).map((m, i) => ({
      index: i + 1,
      title: String(m.title).trim(),
      deliverables: String(m.deliverables).trim(),
      dueDate: String(m.dueDate),
      amount: Number(m.amount),
    })),
    clauses: {
      ipTransfer:
        clauses?.ipTransfer ||
        'Full intellectual property rights transfer to the Gig Provider upon milestone sign-off.',
      confidentiality:
        clauses?.confidentiality ||
        'Both parties agree to keep proprietary source code and business data confidential.',
      governance:
        'Blockchain Dual-Consent Lock: Once signed by both parties, neither party can alter time, cost, or features unilaterally. Any modification requires cryptographic approval from BOTH parties, minting a new Agreement version on-chain.',
    },
    amendmentReason: amendmentReason || '',
  };
}

export async function seedIfEmpty() {
  await chain.init();
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM identities').get();
  if (existing.cnt > 0) return;

  console.log('[seed] Initializing TrustWork Freelance Marketplace, Gigs, Proposals & Blockchain Contracts...');

  const baseTs = Math.floor(Date.now() / 1000) - 90000;
  const users = {};

  for (let i = 0; i < DEMO_USERS.length; i++) {
    const u = DEMO_USERS[i];
    const wallet = new ethers.Wallet(u.privateKey);
    const did = formatDid(wallet.address);
    const { hash: profileHash } = keccak256Json({
      did,
      name: u.name,
      organization: u.organization,
      domain: u.domain,
    });

    const receipt = await chain.sendTx(
      'registerIdentity',
      [wallet.address, did, ISSUER_TIER_ENUM[u.issuer_tier], profileHash],
      {
        actorAddress: wallet.address,
        summary: `Registered Account DID (${u.name})`,
        referenceId: did,
        timestampSec: baseTs + i * 200,
      }
    );

    db.prepare(`
      INSERT INTO identities (
        did, address, name, headline, email, password_hash, bio, role, hourly_rate, location,
        organization, domain, issuer_tier, kyb_verified, skills_json, avatar_color,
        demo_private_key, tx_hash, block_number, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      did,
      wallet.address,
      u.name,
      u.headline,
      u.email,
      hashPassword('demo123'),
      u.bio,
      u.role,
      u.hourly_rate,
      u.location,
      u.organization,
      u.domain,
      u.issuer_tier,
      u.kyb_verified,
      JSON.stringify(u.skills),
      u.avatar_color,
      u.privateKey,
      receipt.txHash,
      receipt.blockNumber,
      new Date((baseTs + i * 200) * 1000).toISOString()
    );

    users[u.email] = { ...u, address: wallet.address, did };
  }

  const mili = users['mili@trustwork.io'];
  const acme = users['rohan@acmecorp.io'];
  const novafin = users['ananya@novafin.xyz'];
  const arjun = users['arjun@zkshield.dev'];
  const sneha = users['sneha@kapoordesign.in'];

  const insertGig = db.prepare(`
    INSERT INTO gigs (
      id, poster_did, title, description, category, budget_min, budget_max, currency,
      duration_days, deadline, experience_level, skills_json, features_json, status,
      hired_freelancer_did, root_agreement_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertProposal = db.prepare(`
    INSERT INTO proposals (
      id, gig_id, freelancer_did, cover_letter, proposed_cost, currency,
      proposed_duration_days, proposed_deadline, proposed_features_json,
      proposed_milestones_json, status, agreement_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMessage = db.prepare(`
    INSERT INTO messages (id, thread_id, sender_did, body, message_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertAgreement = db.prepare(`
    INSERT INTO agreements (
      id, gig_id, root_agreement_id, parent_agreement_id, superseded_by_id, version,
      title, summary, category, client_did, client_address, freelancer_did, freelancer_address,
      proposed_by_did, start_date, deadline, duration_days, total_cost, currency, payment_schedule,
      features_json, milestones_spec_json, clauses_json, amendment_reason,
      canonical_payload_json, terms_hash, signing_digest, ipfs_cid,
      client_signature, client_signed_at, freelancer_signature, freelancer_signed_at,
      status, tx_hash, block_number, gas_used, anchored_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // =========================================================================
  // GIG 1 (OPEN): Posted by Acme Corp — AI Customer Support Copilot & RAG Pipeline
  // =========================================================================
  const gig1Id = 'gig-acme-rag-copilot';
  insertGig.run(
    gig1Id,
    acme.did,
    'Build Enterprise AI Support Copilot & Vector Search API',
    'We need a seasoned backend/AI engineer to build an internal retrieval-augmented generation (RAG) API over 50k merchant support docs with strict role-based citations, streaming SSE responses, and latency analytics.',
    'AI & Machine Learning',
    350000,
    500000,
    'INR',
    28,
    '2026-12-28',
    'Senior',
    JSON.stringify(['Python', 'FastAPI', 'PostgreSQL', 'Vector Search', 'React']),
    JSON.stringify([
      { name: 'Document Ingestion & Chunking Worker', acceptanceCriteria: 'Processes PDF/Markdown in <3s' },
      { name: 'Citation-Backed Streaming Chat API', acceptanceCriteria: 'Zero hallucinated doc links' },
      { name: 'Admin Analytics Dashboard', acceptanceCriteria: 'Live token & latency metrics' },
    ]),
    'OPEN',
    null,
    null,
    new Date((baseTs + 50000) * 1000).toISOString()
  );

  // Proposal from Arjun on Gig 1
  insertProposal.run(
    'prop-arjun-gig1',
    gig1Id,
    arjun.did,
    'Hi Rohan! I recently built a hybrid pgvector + TypeScript RAG dashboard for a FinTech team. I can deliver all 3 modules in 25 days with full automated evaluation benchmarks.',
    420000,
    'INR',
    25,
    '2026-12-24',
    JSON.stringify([
      { name: 'Document Ingestion & pgvector Indexer', description: 'Incremental chunking pipeline', acceptanceCriteria: '<3s indexing' },
      { name: 'Streaming Citation API', description: 'SSE endpoint with source spans', acceptanceCriteria: '95%+ retrieval recall' },
      { name: 'React Admin Analytics View', description: 'Real-time usage & feedback dashboard', acceptanceCriteria: 'Responsive UI' },
    ]),
    JSON.stringify([
      { title: 'Milestone 1: Ingestion Pipeline & Vector Store', deliverables: 'Backend worker + pgvector schema', dueDate: '2026-12-10', amount: 210000 },
      { title: 'Milestone 2: Streaming Chat API & Admin UI', deliverables: 'SSE API + React dashboard', dueDate: '2026-12-24', amount: 210000 },
    ]),
    'PENDING',
    null,
    new Date((baseTs + 52000) * 1000).toISOString()
  );

  // =========================================================================
  // GIG 2 (OPEN): Posted by Mili Nair! (Showing Mili is BOTH a Freelancer AND a Gig Provider!)
  // =========================================================================
  const gig2Id = 'gig-mili-saas-design';
  insertGig.run(
    gig2Id,
    mili.did,
    'UI/UX Redesign & Figma Component System for Developer Observability Tool',
    'I am launching an open-core API latency monitoring platform and need a product designer to craft a clean dark/light design system, onboarding flow, and interactive trace waterfall view in Figma.',
    'UI/UX & Product Design',
    160000,
    240000,
    'INR',
    21,
    '2026-12-20',
    'Intermediate / Senior',
    JSON.stringify(['UI/UX Design', 'Figma', 'Design Systems', 'Prototyping']),
    JSON.stringify([
      { name: 'Figma Design Tokens & Component Kit', acceptanceCriteria: '40+ auto-layout components' },
      { name: 'Trace Waterfall & Alerting Screens', acceptanceCriteria: 'Interactive clickable prototype' },
    ]),
    'OPEN',
    null,
    null,
    new Date((baseTs + 54000) * 1000).toISOString()
  );

  // Proposal from Sneha Kapoor on Mili's Gig!
  insertProposal.run(
    'prop-sneha-gig2',
    gig2Id,
    sneha.did,
    'Hey Mili! Developer tools are my favorite domain. I can deliver a complete tokenized Figma kit (dark + light mode) plus interactive trace explorer flows in 18 days.',
    195000,
    'INR',
    18,
    '2026-12-18',
    JSON.stringify([
      { name: 'Tokenized Figma Design System (Light + Dark)', description: 'Variables, typography, charts, tables', acceptanceCriteria: '40+ components' },
      { name: 'Interactive Trace & Onboarding Prototype', description: 'End-to-end user flows ready for dev handoff', acceptanceCriteria: 'Complete dev specs' },
    ]),
    JSON.stringify([
      { title: 'Milestone 1: Design System & Core Layout', deliverables: 'Figma library file', dueDate: '2026-12-09', amount: 95000 },
      { title: 'Milestone 2: Trace Explorer & Dev Handoff', deliverables: 'Interactive prototype + specs', dueDate: '2026-12-18', amount: 100000 },
    ]),
    'PENDING',
    null,
    new Date((baseTs + 56000) * 1000).toISOString()
  );

  // =========================================================================
  // GIG 3 (OPEN): Posted by NovaFin Labs — Cross-Platform Mobile Wallet App
  // =========================================================================
  insertGig.run(
    'gig-novafin-mobile',
    novafin.did,
    'React Native Biometric Passkey & Instant Checkout SDK',
    'Looking for a mobile/full-stack engineer to build a drop-in React Native checkout sheet supporting Passkeys/WebAuthn and UPI intent flows.',
    'Mobile Development',
    280000,
    400000,
    'INR',
    30,
    '2026-12-30',
    'Senior',
    JSON.stringify(['React', 'TypeScript', 'Mobile UI', 'WebAuthn']),
    JSON.stringify([
      { name: 'Biometric Passkey Sign-In Module', acceptanceCriteria: 'iOS FaceID + Android BiometricPrompt' },
      { name: 'Drop-In Checkout Bottom Sheet', acceptanceCriteria: '<60fps smooth animations' },
    ]),
    'OPEN',
    null,
    null,
    new Date((baseTs + 58000) * 1000).toISOString()
  );

  // =========================================================================
  // GIG 4 (COMPLETED CONTRACT WITH v1 -> v2 MUTUAL AMENDMENT + W3C CREDENTIAL):
  // Project Apex — Acme Corp hired Mili Nair
  // =========================================================================
  const gigApexId = 'gig-project-apex';
  const apexV1Id = ethers.id('agreement:project-apex:v1');
  const apexV2Id = ethers.id('agreement:project-apex:v2');

  insertGig.run(
    gigApexId,
    acme.did,
    'Project Apex — High-Throughput Backend Payments & Settlement Engine',
    'Architect and implement Acme Corp core double-entry ledger, merchant payout webhooks, and multi-currency reconciliation.',
    'Backend & Distributed Systems',
    800000,
    1200000,
    'INR',
    60,
    '2026-10-30',
    'Principal',
    JSON.stringify(['Go', 'Distributed Systems', 'Payment Rails', 'PostgreSQL']),
    JSON.stringify([
      { name: 'Double-Entry Ledger Core', acceptanceCriteria: '5,000 TPS zero-drift settlement' },
      { name: 'Signed Merchant Webhooks', acceptanceCriteria: 'P99 < 85ms' },
      { name: 'Multi-Currency UPI Reconciliation', acceptanceCriteria: 'T+0 automated settlement' },
    ]),
    'COMPLETED',
    mili.did,
    apexV1Id,
    new Date((baseTs + 3000) * 1000).toISOString()
  );

  const apexV1Payload = buildCanonicalAgreementPayload({
    version: 1,
    parentAgreementId: null,
    title: 'Project Apex — Core Backend Payments Engine',
    summary: 'Fault-tolerant double-entry ledger & merchant webhook settlement engine for Acme Corp.',
    category: 'Backend & Distributed Systems',
    clientDid: acme.did,
    freelancerDid: mili.did,
    startDate: '2026-09-01',
    deadline: '2026-10-15',
    durationDays: 45,
    totalCost: 850000,
    currency: 'INR',
    paymentSchedule: 'Milestone-Based (2 Stages)',
    features: [
      {
        name: 'Idempotent Double-Entry Ledger Core',
        description: 'ACID payment ledger handling 5,000 TPS without duplicate settlements.',
        acceptanceCriteria: '100% pass on fault-injection suite',
      },
      {
        name: 'Cryptographic Webhook Dispatcher',
        description: 'HMAC-signed merchant payout notifications with retry queues.',
        acceptanceCriteria: 'P99 latency under 85ms',
      },
    ],
    milestones: [
      {
        title: 'Milestone 1: Double-Entry Ledger & Settlement API',
        deliverables: 'Go ledger service, PostgreSQL migrations, benchmark suite',
        dueDate: '2026-09-22',
        amount: 425000,
      },
      {
        title: 'Milestone 2: Webhook Dispatcher & Production Cutover',
        deliverables: 'Webhook worker, Prometheus metrics, deployment guide',
        dueDate: '2026-10-15',
        amount: 425000,
      },
    ],
    clauses: {},
    amendmentReason: '',
  });

  const { canonical: apexV1Canonical, hash: apexV1Hash } = keccak256Json(apexV1Payload);
  const { cid: apexV1Cid } = pinToIpfsVault(apexV1Payload, { type: 'DIGITAL_AGREEMENT', version: 1 });
  const apexV1Digest = computeInitialAgreementDigest({
    agreementId: apexV1Id,
    gigProvider: acme.address,
    freelancer: mili.address,
    termsHash: apexV1Hash,
  });
  const apexV1ClientSig = await signDigestWithKey(acme.privateKey, apexV1Digest);
  const apexV1FreelancerSig = await signDigestWithKey(mili.privateKey, apexV1Digest);

  const apexV1Receipt = await chain.sendTx(
    'anchorAgreement',
    [apexV1Id, acme.address, mili.address, apexV1Hash, apexV1Cid, apexV1ClientSig, apexV1FreelancerSig],
    {
      actorAddress: acme.address,
      summary: 'Anchored Dual-Signed Agreement v1: Project Apex (₹8,50,000)',
      referenceId: apexV1Id,
      timestampSec: baseTs + 3600,
    }
  );

  // Mutual Amendment -> v2
  const apexV2Payload = buildCanonicalAgreementPayload({
    version: 2,
    parentAgreementId: apexV1Id,
    title: 'Project Apex — Core Backend Payments & Multi-Currency Settlement Engine',
    summary: 'Expanded scope mutually agreed by Rohan (Acme Corp) and Mili Nair to add Real-Time UPI & FX Reconciliation.',
    category: 'Backend & Distributed Systems',
    clientDid: acme.did,
    freelancerDid: mili.did,
    startDate: '2026-09-01',
    deadline: '2026-10-30',
    durationDays: 60,
    totalCost: 1150000,
    currency: 'INR',
    paymentSchedule: 'Milestone-Based (3 Stages)',
    features: [
      ...apexV1Payload.features,
      {
        name: 'Real-Time UPI & Multi-Currency FX Reconciliation',
        description: 'Automated T+0 reconciliation across INR, USD, and SGD settlement accounts.',
        acceptanceCriteria: 'Zero drift across 1M test transactions',
      },
    ],
    milestones: [
      ...apexV1Payload.milestones,
      {
        title: 'Milestone 3: Multi-Currency FX & UPI Reconciliation',
        deliverables: 'FX router service + automated T+0 reconciliation verifier',
        dueDate: '2026-10-30',
        amount: 300000,
      },
    ],
    clauses: {},
    amendmentReason:
      'Both parties agreed to add Milestone 3 (Multi-Currency UPI Reconciliation), extending timeline by 15 days and increasing compensation from ₹8,50,000 to ₹11,50,000.',
  });

  const { canonical: apexV2Canonical, hash: apexV2Hash } = keccak256Json(apexV2Payload);
  const { cid: apexV2Cid } = pinToIpfsVault(apexV2Payload, { type: 'DIGITAL_AGREEMENT', version: 2 });
  const apexV2Digest = computeAmendmentDigest({
    newAgreementId: apexV2Id,
    newVersion: 2,
    parentAgreementId: apexV1Id,
    gigProvider: acme.address,
    freelancer: mili.address,
    newTermsHash: apexV2Hash,
  });
  const apexV2ClientSig = await signDigestWithKey(acme.privateKey, apexV2Digest);
  const apexV2FreelancerSig = await signDigestWithKey(mili.privateKey, apexV2Digest);

  const apexV2Receipt = await chain.sendTx(
    'amendAgreement',
    [apexV1Id, apexV2Id, apexV2Hash, apexV2Cid, apexV2ClientSig, apexV2FreelancerSig],
    {
      actorAddress: mili.address,
      summary: 'Mutual Amendment Anchored (v1 -> v2): Project Apex updated to ₹11,50,000',
      referenceId: apexV2Id,
      timestampSec: baseTs + 7200,
    }
  );

  insertAgreement.run(
    apexV1Id,
    gigApexId,
    apexV1Id,
    null,
    apexV2Id,
    1,
    apexV1Payload.title,
    apexV1Payload.summary,
    apexV1Payload.category,
    acme.did,
    acme.address,
    mili.did,
    mili.address,
    acme.did,
    apexV1Payload.timeline.startDate,
    apexV1Payload.timeline.deadline,
    apexV1Payload.timeline.durationDays,
    apexV1Payload.compensation.totalCost,
    apexV1Payload.compensation.currency,
    apexV1Payload.compensation.paymentSchedule,
    JSON.stringify(apexV1Payload.features),
    JSON.stringify(apexV1Payload.milestones),
    JSON.stringify(apexV1Payload.clauses),
    '',
    apexV1Canonical,
    apexV1Hash,
    apexV1Digest,
    apexV1Cid,
    apexV1ClientSig,
    new Date((baseTs + 3500) * 1000).toISOString(),
    apexV1FreelancerSig,
    new Date((baseTs + 3600) * 1000).toISOString(),
    'SUPERSEDED',
    apexV1Receipt.txHash,
    apexV1Receipt.blockNumber,
    apexV1Receipt.gasUsed,
    new Date((baseTs + 3600) * 1000).toISOString(),
    new Date((baseTs + 3400) * 1000).toISOString()
  );

  insertAgreement.run(
    apexV2Id,
    gigApexId,
    apexV1Id,
    apexV1Id,
    null,
    2,
    apexV2Payload.title,
    apexV2Payload.summary,
    apexV2Payload.category,
    acme.did,
    acme.address,
    mili.did,
    mili.address,
    acme.did,
    apexV2Payload.timeline.startDate,
    apexV2Payload.timeline.deadline,
    apexV2Payload.timeline.durationDays,
    apexV2Payload.compensation.totalCost,
    apexV2Payload.compensation.currency,
    apexV2Payload.compensation.paymentSchedule,
    JSON.stringify(apexV2Payload.features),
    JSON.stringify(apexV2Payload.milestones),
    JSON.stringify(apexV2Payload.clauses),
    apexV2Payload.amendmentReason,
    apexV2Canonical,
    apexV2Hash,
    apexV2Digest,
    apexV2Cid,
    apexV2ClientSig,
    new Date((baseTs + 7100) * 1000).toISOString(),
    apexV2FreelancerSig,
    new Date((baseTs + 7200) * 1000).toISOString(),
    'COMPLETED',
    apexV2Receipt.txHash,
    apexV2Receipt.blockNumber,
    apexV2Receipt.gasUsed,
    new Date((baseTs + 7200) * 1000).toISOString(),
    new Date((baseTs + 7000) * 1000).toISOString()
  );

  const apexCommits = [
    'a94f82e17c09b31f6d22e8a45c71b09f331289c4',
    'c71e05b8921df44e9a110bc8291fa63d778e412a',
    'f03d98a41e76c209b5512d78e3401ab9821ce610',
  ];
  const apexDeliverableHashes = [];

  for (let i = 0; i < apexV2Payload.milestones.length; i++) {
    const mSpec = apexV2Payload.milestones[i];
    const mId = ethers.id(`${apexV2Id}:milestone:${i + 1}`);
    const evidenceBundle = {
      milestoneId: mId,
      agreementId: apexV2Id,
      title: mSpec.title,
      commitHash: apexCommits[i],
      repoUrl: `https://github.com/acmecorp-eng/project-apex/commit/${apexCommits[i]}`,
      notes: `Delivered ${mSpec.title} with 98.4% integration test coverage.`,
    };
    const { hash: delivHash } = keccak256Json(evidenceBundle);
    const { cid: evCid } = pinToIpfsVault(evidenceBundle, { type: 'MILESTONE_EVIDENCE' });
    const mDigest = computeMilestoneDigest({
      milestoneId: mId,
      agreementId: apexV2Id,
      deliverableHash: delivHash,
    });
    const fSig = await signDigestWithKey(mili.privateKey, mDigest);
    const cSig = await signDigestWithKey(acme.privateKey, mDigest);

    const mReceipt = await chain.sendTx(
      'anchorMilestoneSignOff',
      [mId, apexV2Id, delivHash, evCid, fSig, cSig],
      {
        actorAddress: acme.address,
        summary: `Verified Milestone #${i + 1}: ${mSpec.title}`,
        referenceId: mId,
        timestampSec: baseTs + 10000 + i * 1800,
      }
    );
    apexDeliverableHashes.push(delivHash);

    db.prepare(`
      INSERT INTO milestones (
        id, agreement_id, root_agreement_id, idx, title, deliverables, due_date, amount,
        evidence_notes, commit_hash, repo_url, artifact_name, artifact_content,
        deliverable_hash, evidence_cid, signing_digest,
        freelancer_signature, submitted_at, client_signature, signed_off_at,
        status, tx_hash, block_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED_ONCHAIN', ?, ?)
    `).run(
      mId,
      apexV2Id,
      apexV1Id,
      i + 1,
      mSpec.title,
      mSpec.deliverables,
      mSpec.dueDate,
      mSpec.amount,
      evidenceBundle.notes,
      evidenceBundle.commitHash,
      evidenceBundle.repoUrl,
      `apex-m${i + 1}.json`,
      JSON.stringify(evidenceBundle, null, 2),
      delivHash,
      evCid,
      mDigest,
      fSig,
      new Date((baseTs + 9800 + i * 1800) * 1000).toISOString(),
      cSig,
      new Date((baseTs + 10000 + i * 1800) * 1000).toISOString(),
      mReceipt.txHash,
      mReceipt.blockNumber
    );
  }

  const completeDigest = computeCompleteAgreementDigest({
    agreementId: apexV2Id,
    termsHash: apexV2Hash,
  });
  const completeSig = await signDigestWithKey(acme.privateKey, completeDigest);
  await chain.sendTx('completeAgreement', [apexV2Id, completeSig], {
    actorAddress: acme.address,
    summary: 'Completed Contract on-chain: Project Apex (v2)',
    referenceId: apexV2Id,
    timestampSec: baseTs + 16000,
  });

  // Issue W3C Credential to Mili Nair
  const apexCredId = ethers.id('vc:project-apex:mili');
  const issuedAtIso = new Date((baseTs + 16500) * 1000).toISOString();
  const vcUnsigned = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://trustwork.protocol/credentials/v2',
    ],
    id: `urn:trustwork:vc:${apexCredId}`,
    type: ['VerifiableCredential', 'TrustWorkProfessionalCredential'],
    issuer: {
      id: acme.did,
      name: acme.name,
      organization: acme.organization,
      tier: acme.issuer_tier,
      domain: acme.domain,
    },
    issuanceDate: issuedAtIso,
    credentialSubject: {
      id: mili.did,
      name: mili.name,
      projectTitle: apexV2Payload.title,
      rolePerformed: 'Lead Backend & Distributed Payments Architect',
      statement: 'Mili completed the backend payments & multi-currency settlement engine for Project Apex.',
      skillsVerified: ['Go', 'Distributed Systems', 'Payment Rails', 'PostgreSQL'],
      agreementId: apexV2Id,
      agreementVersion: 2,
      agreementTermsHash: apexV2Hash,
      deliverableHashes: apexDeliverableHashes,
      rating: 5,
    },
  };
  const { hash: apexVcHash } = keccak256Json(vcUnsigned);
  const apexVcDigest = computeCredentialDigest({
    credentialId: apexCredId,
    vcHash: apexVcHash,
    agreementId: apexV2Id,
    issuer: acme.address,
    subject: mili.address,
  });
  const apexVcSig = await signDigestWithKey(acme.privateKey, apexVcDigest);
  const fullVcDoc = {
    ...vcUnsigned,
    proof: {
      type: 'EcdsaSecp256k1RecoverySignature2020',
      created: issuedAtIso,
      proofPurpose: 'assertionMethod',
      verificationMethod: `${acme.did}#controller`,
      vcPayloadKeccak256: apexVcHash,
      onChainDigest: apexVcDigest,
      jwsSignature: apexVcSig,
    },
  };
  const { cid: apexVcCid } = pinToIpfsVault(fullVcDoc, { type: 'W3C_VERIFIABLE_CREDENTIAL' });
  const vcReceipt = await chain.sendTx(
    'anchorCredential',
    [apexCredId, apexVcHash, apexV2Id, acme.address, mili.address, apexVcCid, apexVcSig],
    {
      actorAddress: acme.address,
      summary: 'Issued Verified Work Credential: Acme Corp -> Mili Nair',
      referenceId: apexCredId,
      timestampSec: baseTs + 16500,
    }
  );

  db.prepare(`
    INSERT INTO verifiable_credentials (
      id, agreement_id, issuer_did, issuer_address, subject_did, subject_address,
      project_title, role_performed, summary_statement, skills_verified_json,
      contract_value, currency, rating, deliverable_hashes_json,
      vc_json, vc_hash, ipfs_cid, signing_digest, issuer_signature,
      revoked, tx_hash, block_number, gas_used, issued_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
  `).run(
    apexCredId,
    apexV2Id,
    acme.did,
    acme.address,
    mili.did,
    mili.address,
    apexV2Payload.title,
    'Lead Backend & Distributed Payments Architect',
    'Mili completed the backend payments & multi-currency settlement engine for Project Apex.',
    JSON.stringify(['Go', 'Distributed Systems', 'Payment Rails', 'PostgreSQL']),
    apexV2Payload.compensation.totalCost,
    'INR',
    5,
    JSON.stringify(apexDeliverableHashes),
    JSON.stringify(fullVcDoc, null, 2),
    apexVcHash,
    apexVcCid,
    apexVcDigest,
    apexVcSig,
    vcReceipt.txHash,
    vcReceipt.blockNumber,
    vcReceipt.gasUsed,
    issuedAtIso
  );

  // =========================================================================
  // GIG 5 (ACTIVE IN-PROGRESS CONTRACT + PENDING MUTUAL MODIFICATION REQUEST):
  // NovaFin Labs hired Mili Nair -> Active v1 + Pending Amendment v2 awaiting Mili's co-sign!
  // =========================================================================
  const gigKycId = 'gig-novafin-kyc';
  const kycV1Id = ethers.id('agreement:novafin-kyc:v1');
  const kycV2PropId = ethers.id('agreement:novafin-kyc:v2-proposal');

  insertGig.run(
    gigKycId,
    novafin.did,
    'Zero-Trust KYC Vault & Real-Time Risk Scoring Microservice',
    'Build an encrypted PII tokenizer vault and sub-50ms fraud risk evaluation microservice.',
    'Backend & Distributed Systems',
    550000,
    750000,
    'INR',
    35,
    '2026-12-05',
    'Senior',
    JSON.stringify(['Rust', 'PostgreSQL', 'gRPC', 'Cryptography']),
    JSON.stringify([
      { name: 'Encrypted PII Vault', acceptanceCriteria: 'Zero plaintext PII in logs' },
      { name: 'Sub-50ms Risk Scoring Service', acceptanceCriteria: '2,500 req/s benchmark' },
    ]),
    'IN_CONTRACT',
    mili.did,
    kycV1Id,
    new Date((baseTs + 24000) * 1000).toISOString()
  );

  const kycV1Payload = buildCanonicalAgreementPayload({
    version: 1,
    parentAgreementId: null,
    title: 'Zero-Trust KYC Vault & Risk Scoring Microservice',
    summary: 'Encrypted PII tokenizer and real-time gRPC risk evaluation engine.',
    category: 'Backend & Distributed Systems',
    clientDid: novafin.did,
    freelancerDid: mili.did,
    startDate: '2026-11-01',
    deadline: '2026-12-05',
    durationDays: 35,
    totalCost: 620000,
    currency: 'INR',
    paymentSchedule: 'Milestone-Based (50% / 50%)',
    features: [
      {
        name: 'Encrypted PII Vault & Tokenizer',
        description: 'AES-256-GCM off-chain PII vault separating user records from hash commitments.',
        acceptanceCriteria: 'Zero plaintext PII in telemetry',
      },
      {
        name: 'Sub-50ms Risk Scoring gRPC Service',
        description: 'High-concurrency Rust gRPC risk engine.',
        acceptanceCriteria: '2,500 req/s at <50ms P95',
      },
    ],
    milestones: [
      {
        title: 'Milestone 1: Encrypted PII Vault & Tokenizer',
        deliverables: 'Rust vault module, KMS adapter, gRPC specs',
        dueDate: '2026-11-18',
        amount: 310000,
      },
      {
        title: 'Milestone 2: Risk Scorer & Load Benchmark',
        deliverables: 'Risk service, Docker deployment, load report',
        dueDate: '2026-12-05',
        amount: 310000,
      },
    ],
    clauses: {},
    amendmentReason: '',
  });

  const { canonical: kycV1Canonical, hash: kycV1Hash } = keccak256Json(kycV1Payload);
  const { cid: kycV1Cid } = pinToIpfsVault(kycV1Payload, { type: 'DIGITAL_AGREEMENT', version: 1 });
  const kycV1Digest = computeInitialAgreementDigest({
    agreementId: kycV1Id,
    gigProvider: novafin.address,
    freelancer: mili.address,
    termsHash: kycV1Hash,
  });
  const kycV1ClientSig = await signDigestWithKey(novafin.privateKey, kycV1Digest);
  const kycV1FreelancerSig = await signDigestWithKey(mili.privateKey, kycV1Digest);

  const kycV1Receipt = await chain.sendTx(
    'anchorAgreement',
    [kycV1Id, novafin.address, mili.address, kycV1Hash, kycV1Cid, kycV1ClientSig, kycV1FreelancerSig],
    {
      actorAddress: novafin.address,
      summary: 'Anchored Dual-Signed Agreement v1: Zero-Trust KYC Vault (₹6,20,000)',
      referenceId: kycV1Id,
      timestampSec: baseTs + 25000,
    }
  );

  insertAgreement.run(
    kycV1Id,
    gigKycId,
    kycV1Id,
    null,
    null,
    1,
    kycV1Payload.title,
    kycV1Payload.summary,
    kycV1Payload.category,
    novafin.did,
    novafin.address,
    mili.did,
    mili.address,
    novafin.did,
    kycV1Payload.timeline.startDate,
    kycV1Payload.timeline.deadline,
    kycV1Payload.timeline.durationDays,
    kycV1Payload.compensation.totalCost,
    kycV1Payload.compensation.currency,
    kycV1Payload.compensation.paymentSchedule,
    JSON.stringify(kycV1Payload.features),
    JSON.stringify(kycV1Payload.milestones),
    JSON.stringify(kycV1Payload.clauses),
    '',
    kycV1Canonical,
    kycV1Hash,
    kycV1Digest,
    kycV1Cid,
    kycV1ClientSig,
    new Date((baseTs + 24900) * 1000).toISOString(),
    kycV1FreelancerSig,
    new Date((baseTs + 25000) * 1000).toISOString(),
    'ACTIVE',
    kycV1Receipt.txHash,
    kycV1Receipt.blockNumber,
    kycV1Receipt.gasUsed,
    new Date((baseTs + 25000) * 1000).toISOString(),
    new Date((baseTs + 24500) * 1000).toISOString()
  );

  // Milestone 1 submitted by Mili
  const kycM1Id = ethers.id(`${kycV1Id}:milestone:1`);
  const kycM1Evidence = {
    milestoneId: kycM1Id,
    agreementId: kycV1Id,
    title: kycV1Payload.milestones[0].title,
    commitHash: '88b12f904e31a76d92c1108fa4b7712e9031ca55',
    repoUrl: 'https://github.com/novafin/kyc-vault/commit/88b12f904e31a76d92c1108fa4b7712e9031ca55',
    notes: 'Completed AES-256-GCM PII vault crate + integration tests.',
  };
  const { hash: kycM1Hash } = keccak256Json(kycM1Evidence);
  const { cid: kycM1Cid } = pinToIpfsVault(kycM1Evidence, { type: 'MILESTONE_EVIDENCE' });
  const kycM1Digest = computeMilestoneDigest({
    milestoneId: kycM1Id,
    agreementId: kycV1Id,
    deliverableHash: kycM1Hash,
  });
  const kycM1FreelancerSig = await signDigestWithKey(mili.privateKey, kycM1Digest);

  db.prepare(`
    INSERT INTO milestones (
      id, agreement_id, root_agreement_id, idx, title, deliverables, due_date, amount,
      evidence_notes, commit_hash, repo_url, artifact_name, artifact_content,
      deliverable_hash, evidence_cid, signing_digest,
      freelancer_signature, submitted_at, status
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EVIDENCE_SUBMITTED')
  `).run(
    kycM1Id,
    kycV1Id,
    kycV1Id,
    kycV1Payload.milestones[0].title,
    kycV1Payload.milestones[0].deliverables,
    kycV1Payload.milestones[0].dueDate,
    kycV1Payload.milestones[0].amount,
    kycM1Evidence.notes,
    kycM1Evidence.commitHash,
    kycM1Evidence.repoUrl,
    'kyc-vault-deliverable.json',
    JSON.stringify(kycM1Evidence, null, 2),
    kycM1Hash,
    kycM1Cid,
    kycM1Digest,
    kycM1FreelancerSig,
    new Date((baseTs + 30000) * 1000).toISOString()
  );

  db.prepare(`
    INSERT INTO milestones (
      id, agreement_id, root_agreement_id, idx, title, deliverables, due_date, amount, status
    ) VALUES (?, ?, ?, 2, ?, ?, ?, ?, 'PENDING')
  `).run(
    ethers.id(`${kycV1Id}:milestone:2`),
    kycV1Id,
    kycV1Id,
    kycV1Payload.milestones[1].title,
    kycV1Payload.milestones[1].deliverables,
    kycV1Payload.milestones[1].dueDate,
    kycV1Payload.milestones[1].amount
  );

  // Pending Change Order / Amendment v2 requested by Ananya (NovaFin) -> awaiting Mili's co-signature!
  const kycV2Payload = buildCanonicalAgreementPayload({
    version: 2,
    parentAgreementId: kycV1Id,
    title: 'Zero-Trust KYC Vault, Risk Scorer & Real-Time Fraud Graph Alerts',
    summary: 'Expanded scope adding real-time fraud ring graph detection alongside the PII Vault & gRPC scorer.',
    category: 'Backend & Distributed Systems',
    clientDid: novafin.did,
    freelancerDid: mili.did,
    startDate: '2026-11-01',
    deadline: '2026-12-19',
    durationDays: 49,
    totalCost: 800000,
    currency: 'INR',
    paymentSchedule: 'Milestone-Based (3 Stages)',
    features: [
      ...kycV1Payload.features,
      {
        name: 'Streaming Fraud Ring Graph Detector',
        description: 'Bipartite graph cycle detector flagging synthetic identity rings in real time.',
        acceptanceCriteria: '<100ms cycle detection on 50k active accounts',
      },
    ],
    milestones: [
      ...kycV1Payload.milestones,
      {
        title: 'Milestone 3: Fraud Graph Detector & Webhook Alerts',
        deliverables: 'Graph analyzer module + Kafka alert producer',
        dueDate: '2026-12-19',
        amount: 180000,
      },
    ],
    clauses: {},
    amendmentReason:
      'Adding Milestone 3 (Streaming Fraud Ring Graph Detector) with +₹1,80,000 budget increase and +14 days timeline extension.',
  });

  const { canonical: kycV2Canonical, hash: kycV2Hash } = keccak256Json(kycV2Payload);
  const { cid: kycV2Cid } = pinToIpfsVault(kycV2Payload, { type: 'AMENDMENT_PROPOSAL', version: 2 });
  const kycV2Digest = computeAmendmentDigest({
    newAgreementId: kycV2PropId,
    newVersion: 2,
    parentAgreementId: kycV1Id,
    gigProvider: novafin.address,
    freelancer: mili.address,
    newTermsHash: kycV2Hash,
  });
  const kycV2ClientSig = await signDigestWithKey(novafin.privateKey, kycV2Digest);

  insertAgreement.run(
    kycV2PropId,
    gigKycId,
    kycV1Id,
    kycV1Id,
    null,
    2,
    kycV2Payload.title,
    kycV2Payload.summary,
    kycV2Payload.category,
    novafin.did,
    novafin.address,
    mili.did,
    mili.address,
    novafin.did,
    kycV2Payload.timeline.startDate,
    kycV2Payload.timeline.deadline,
    kycV2Payload.timeline.durationDays,
    kycV2Payload.compensation.totalCost,
    kycV2Payload.compensation.currency,
    kycV2Payload.compensation.paymentSchedule,
    JSON.stringify(kycV2Payload.features),
    JSON.stringify(kycV2Payload.milestones),
    JSON.stringify(kycV2Payload.clauses),
    kycV2Payload.amendmentReason,
    kycV2Canonical,
    kycV2Hash,
    kycV2Digest,
    kycV2Cid,
    kycV2ClientSig,
    new Date((baseTs + 35000) * 1000).toISOString(),
    null,
    null,
    'AMENDMENT_PENDING',
    null,
    null,
    null,
    null,
    new Date((baseTs + 35000) * 1000).toISOString()
  );

  // Seed realistic workspace chat messages on KYC contract
  insertMessage.run(
    'msg-1',
    kycV1Id,
    mili.did,
    'Hi Ananya! I just pushed Milestone 1 (Encrypted PII Vault) commit 88b12f90 and attached the deliverable proof for your review.',
    'TEXT',
    new Date((baseTs + 30100) * 1000).toISOString()
  );
  insertMessage.run(
    'msg-2',
    kycV1Id,
    novafin.did,
    'Awesome work Mili! Also, our compliance team wants to add a Streaming Fraud Graph Detector module. I just sent a signed Contract Modification Proposal (v2) adding +₹1,80,000 and +14 days — once you co-sign, it will mint the updated agreement on-chain!',
    'TEXT',
    new Date((baseTs + 35100) * 1000).toISOString()
  );

  // Seed ZKP privacy badge for Mili Nair
  const zkp = createThresholdCommitmentProof({
    subjectDid: mili.did,
    claimType: 'MIN_EARNINGS_INR',
    threshold: 1000000,
    actualValue: 1150000,
    credentialHashes: [apexVcHash],
  });
  db.prepare(`
    INSERT INTO zkp_proofs (id, subject_did, title, claim_type, threshold, proof_json, public_commitment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ethers.id('zkp:mili:10lakh-enterprise'),
    mili.did,
    'Verified ₹10,00,000+ Enterprise Contract Revenue (Private Client Details Hidden)',
    'MIN_EARNINGS_INR',
    1000000,
    JSON.stringify(zkp, null, 2),
    zkp.publicCommitment,
    zkp.createdAt
  );

  console.log('[seed] TrustWork Marketplace & Blockchain Contracts ready.');
}
