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

// Deterministic demo persona private keys so identities stay stable across clean seeds
const DEMO_PERSONAS = [
  {
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    name: 'Mili Nair',
    headline: 'Principal Backend & Distributed Systems Architect',
    email: 'mili.nair@trustwork.dev',
    bio: '8+ years building high-throughput payment rails, Go/Rust microservices, and cryptographic ledger settlements.',
    role: 'FREELANCER',
    organization: 'Independent Consultant',
    domain: 'milinair.dev',
    issuer_tier: 'INDIVIDUAL',
    kyb_verified: 1,
    skills: ['Distributed Systems', 'Go', 'Rust', 'Payment Engines', 'PostgreSQL', 'Zero-Trust APIs'],
    avatar_color: '#E11D48',
  },
  {
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    name: 'Acme Corp',
    headline: 'Enterprise Global Payment Infrastructure',
    email: 'engineering-procurement@acmecorp.io',
    bio: 'ISO-27001 certified enterprise financial technology conglomerate issuing cryptographically signed contractor credentials.',
    role: 'CLIENT',
    organization: 'Acme Corporation Pvt. Ltd.',
    domain: 'acmecorp.io',
    issuer_tier: 'ENTERPRISE',
    kyb_verified: 1,
    skills: ['Enterprise FinTech', 'Payment Rails', 'Cloud Infrastructure'],
    avatar_color: '#0284C7',
  },
  {
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    name: 'NovaFin Labs',
    headline: 'Series-B RegTech & Risk Intelligence Startup',
    email: 'contracts@novafin.xyz',
    bio: 'Verified fintech organization hiring specialized cryptography, ML, and backend engineers.',
    role: 'CLIENT',
    organization: 'NovaFin Labs Inc.',
    domain: 'novafin.xyz',
    issuer_tier: 'VERIFIED_ORG',
    kyb_verified: 1,
    skills: ['RegTech', 'KYC Automation', 'Graph Analytics'],
    avatar_color: '#F59E0B',
  },
  {
    privateKey: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
    name: 'Arjun Verma',
    headline: 'Smart Contract Engineer & Formal Verification Lead',
    email: 'arjun@zkshield.dev',
    bio: 'Solidity & EVM security specialist focused on escrow state machines, W3C DIDs, and zero-knowledge circuits.',
    role: 'FREELANCER',
    organization: 'ZKShield Security',
    domain: 'zkshield.dev',
    issuer_tier: 'INDIVIDUAL',
    kyb_verified: 1,
    skills: ['Solidity', 'EVM Security', 'W3C DIDs', 'Zero-Knowledge Proofs', 'TypeScript'],
    avatar_color: '#059669',
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
    category: String(category || 'Software Engineering').trim(),
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
      acceptanceCriteria: String(f.acceptanceCriteria || 'Verified pass on test suite').trim(),
    })),
    milestones: (milestones || []).map((m, i) => ({
      index: i + 1,
      title: String(m.title).trim(),
      deliverables: String(m.deliverables).trim(),
      dueDate: String(m.dueDate),
      amount: Number(m.amount),
    })),
    clauses: {
      ipTransfer: clauses?.ipTransfer || 'Full IP rights transfer to Gig Provider upon milestone sign-off.',
      confidentiality: clauses?.confidentiality || 'Mutual NDA applies to proprietary source code and architecture.',
      governance:
        'Immutable Dual-Signature Rule: Neither party can unilaterally alter timeline, cost, or features. Any modification requires cryptographic signatures from BOTH parties to mint a new on-chain Agreement version.',
    },
    amendmentReason: amendmentReason || '',
  };
}

export async function seedIfEmpty() {
  await chain.init();
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM identities').get();
  if (existing.cnt > 0) return;

  console.log('[seed] Seeding TrustWork initial personas, dual-signed agreements, amendments & W3C VCs...');

  const baseTs = Math.floor(Date.now() / 1000) - 80000;
  const personasByName = {};

  // 1. Register Self-Controlled DIDs on-chain
  for (let i = 0; i < DEMO_PERSONAS.length; i++) {
    const p = DEMO_PERSONAS[i];
    const wallet = new ethers.Wallet(p.privateKey);
    const did = formatDid(wallet.address);
    const { hash: profileHash } = keccak256Json({
      did,
      name: p.name,
      organization: p.organization,
      domain: p.domain,
    });

    const receipt = await chain.sendTx(
      'registerIdentity',
      [wallet.address, did, ISSUER_TIER_ENUM[p.issuer_tier], profileHash],
      {
        actorAddress: wallet.address,
        summary: `Registered DID ${did.slice(0, 24)}... (${p.name} · ${p.issuer_tier})`,
        referenceId: did,
        timestampSec: baseTs + i * 300,
      }
    );

    db.prepare(
      `INSERT INTO identities
       (did, address, name, headline, email, bio, role, organization, domain, issuer_tier, kyb_verified, skills_json, avatar_color, demo_private_key, tx_hash, block_number, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      did,
      wallet.address,
      p.name,
      p.headline,
      p.email,
      p.bio,
      p.role,
      p.organization,
      p.domain,
      p.issuer_tier,
      p.kyb_verified,
      JSON.stringify(p.skills),
      p.avatar_color,
      p.privateKey,
      receipt.txHash,
      receipt.blockNumber,
      new Date((baseTs + i * 300) * 1000).toISOString()
    );

    personasByName[p.name] = { ...p, address: wallet.address, did };
  }

  const mili = personasByName['Mili Nair'];
  const acme = personasByName['Acme Corp'];
  const novafin = personasByName['NovaFin Labs'];
  const arjun = personasByName['Arjun Verma'];

  // =========================================================================
  // SCENARIO 1 (Slide 07): Project Apex — Anchored v1 -> Mutually Amended to v2 -> Milestones Signed -> W3C VC Issued
  // =========================================================================
  const apexV1Id = ethers.id('agreement:project-apex:v1');
  const apexV1Payload = buildCanonicalAgreementPayload({
    version: 1,
    parentAgreementId: null,
    title: 'Project Apex — Core Backend Payments Engine',
    summary: 'Design and build a fault-tolerant ledger & ISO-20022 payment settlement engine for Acme Corp.',
    category: 'Distributed FinTech Systems',
    clientDid: acme.did,
    freelancerDid: mili.did,
    startDate: '2026-09-01',
    deadline: '2026-10-15',
    durationDays: 45,
    totalCost: 850000,
    currency: 'INR',
    paymentSchedule: 'Milestone-Based (50% / 50%)',
    features: [
      {
        name: 'Idempotent Double-Entry Ledger Core',
        description: 'ACID-compliant payment state machine handling 5,000 TPS with zero duplicate settlements.',
        acceptanceCriteria: '100% pass on chaos fault-injection benchmark',
      },
      {
        name: 'Cryptographic Webhook Dispatcher',
        description: 'HMAC-SHA256 signed merchant payout notifications with exponential retry queues.',
        acceptanceCriteria: 'P99 latency under 85ms',
      },
    ],
    milestones: [
      {
        title: 'Milestone 1: Double-Entry Ledger & Settlement API',
        deliverables: 'Go ledger service, PostgreSQL schema migrations, load test suite',
        dueDate: '2026-09-22',
        amount: 425000,
      },
      {
        title: 'Milestone 2: Webhook Dispatcher & Production Cutover',
        deliverables: 'Signed webhook worker, Prometheus telemetry, runbook documentation',
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
      summary: 'Anchored Dual-Signed Digital Agreement v1: Project Apex (₹8,50,000)',
      referenceId: apexV1Id,
      timestampSec: baseTs + 3600,
    }
  );

  // Mutual Amendment -> v2 (Both Acme Corp & Mili Nair agreed to add Multi-Currency UPI Reconciliation, +₹3,00,000 & +15 days)
  const apexV2Id = ethers.id('agreement:project-apex:v2');
  const apexV2Payload = buildCanonicalAgreementPayload({
    version: 2,
    parentAgreementId: apexV1Id,
    title: 'Project Apex — Core Backend Payments & Multi-Currency Settlement Engine',
    summary:
      'Expanded scope mutually agreed by Acme Corp and Mili Nair to include real-time UPI reconciliation and multi-currency FX settlement.',
    category: 'Distributed FinTech Systems',
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
        description: 'Automated T+0 settlement reconciliation engine across INR, USD, and SGD Nostro accounts.',
        acceptanceCriteria: 'Zero reconciliation drift across 1M synthetic transactions',
      },
    ],
    milestones: [
      {
        title: 'Milestone 1: Double-Entry Ledger & Settlement API',
        deliverables: 'Go ledger service, PostgreSQL schema migrations, load test suite',
        dueDate: '2026-09-22',
        amount: 425000,
      },
      {
        title: 'Milestone 2: Webhook Dispatcher & Production Cutover',
        deliverables: 'Signed webhook worker, Prometheus telemetry, runbook documentation',
        dueDate: '2026-10-12',
        amount: 425000,
      },
      {
        title: 'Milestone 3: Multi-Currency FX & UPI Reconciliation Module',
        deliverables: 'FX settlement router, T+0 reconciliation verifier, audit logs',
        dueDate: '2026-10-30',
        amount: 300000,
      },
    ],
    clauses: {},
    amendmentReason:
      'Mutual scope expansion: Added Milestone 3 (Real-Time UPI & Multi-Currency FX Reconciliation), extended deadline by 15 days, and increased budget from ₹8,50,000 to ₹11,50,000.',
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
      summary: 'Mutual Amendment Anchored (v1 -> v2): Project Apex updated to ₹11,50,000 with dual signatures',
      referenceId: apexV2Id,
      timestampSec: baseTs + 7200,
    }
  );

  // Save Apex v1 (SUPERSEDED) & Apex v2 (COMPLETED)
  const insertAgreementStmt = db.prepare(`
    INSERT INTO agreements (
      id, root_agreement_id, parent_agreement_id, superseded_by_id, version,
      title, summary, category, client_did, client_address, freelancer_did, freelancer_address,
      proposed_by_did, start_date, deadline, duration_days, total_cost, currency, payment_schedule,
      features_json, milestones_spec_json, clauses_json, amendment_reason,
      canonical_payload_json, terms_hash, signing_digest, ipfs_cid,
      client_signature, client_signed_at, freelancer_signature, freelancer_signed_at,
      status, tx_hash, block_number, gas_used, anchored_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAgreementStmt.run(
    apexV1Id,
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

  insertAgreementStmt.run(
    apexV2Id,
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

  // Anchor all 3 Milestones of Project Apex v2
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
      notes: `Completed ${mSpec.title} with 98.4% integration test coverage and zero P0 defects.`,
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
        summary: `Verified Milestone #${i + 1} Sign-Off: ${mSpec.title}`,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      `apex-milestone-${i + 1}-manifest.json`,
      JSON.stringify(evidenceBundle, null, 2),
      delivHash,
      evCid,
      mDigest,
      fSig,
      new Date((baseTs + 9800 + i * 1800) * 1000).toISOString(),
      cSig,
      new Date((baseTs + 10000 + i * 1800) * 1000).toISOString(),
      'VERIFIED_ONCHAIN',
      mReceipt.txHash,
      mReceipt.blockNumber
    );
  }

  // Mark Apex v2 completed on-chain
  const completeDigest = computeCompleteAgreementDigest({
    agreementId: apexV2Id,
    termsHash: apexV2Hash,
  });
  const completeSig = await signDigestWithKey(acme.privateKey, completeDigest);
  await chain.sendTx('completeAgreement', [apexV2Id, completeSig], {
    actorAddress: acme.address,
    summary: 'Completed Agreement on-chain: Project Apex (v2)',
    referenceId: apexV2Id,
    timestampSec: baseTs + 16000,
  });

  // Issue W3C Verifiable Credential for Slide 07 ("Mili completed the backend payments engine for Project Apex")
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
      statement: 'Mili completed the backend payments engine for Project Apex.',
      skillsVerified: ['Go', 'Distributed Systems', 'Payment Engines', 'PostgreSQL', 'UPI Reconciliation'],
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
      summary: 'Issued W3C Verifiable Credential: Acme Corp -> Mili Nair (Project Apex)',
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
    'Mili completed the backend payments engine for Project Apex.',
    JSON.stringify(['Go', 'Distributed Systems', 'Payment Engines', 'PostgreSQL', 'UPI Reconciliation']),
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
  // SCENARIO 2: Active Agreement (NovaFin Labs <-> Mili Nair) + Pending Mutual Amendment Proposal (v2)
  // =========================================================================
  const kycV1Id = ethers.id('agreement:novafin-kyc:v1');
  const kycV1Payload = buildCanonicalAgreementPayload({
    version: 1,
    parentAgreementId: null,
    title: 'Zero-Trust KYC Telemetry & Risk Scoring Engine',
    summary: 'Real-time identity verification pipeline and cryptographic audit trail microservice.',
    category: 'Cybersecurity & RegTech',
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
        description: 'Envelope-encrypted off-chain vault separating GDPR personal data from hash commitments.',
        acceptanceCriteria: 'Zero plaintext PII in logs or telemetry streams',
      },
      {
        name: 'Sub-50ms Risk Scoring gRPC Service',
        description: 'Rust gRPC microservice evaluating device & velocity signals.',
        acceptanceCriteria: 'Handles 2,500 req/s at <50ms P95',
      },
    ],
    milestones: [
      {
        title: 'Milestone 1: PII Vault & Cryptographic Tokenizer',
        deliverables: 'Rust vault crate, KMS integration, OpenAPI/gRPC proto specs',
        dueDate: '2026-11-18',
        amount: 310000,
      },
      {
        title: 'Milestone 2: Streaming Risk Scorer & Load Benchmark',
        deliverables: 'Risk engine service, Docker deployment charts, benchmark report',
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
      summary: 'Anchored Dual-Signed Digital Agreement v1: Zero-Trust KYC Engine (₹6,20,000)',
      referenceId: kycV1Id,
      timestampSec: baseTs + 25000,
    }
  );

  insertAgreementStmt.run(
    kycV1Id,
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

  // Milestone 1 of KYC v1: Evidence Submitted by Mili, ready for NovaFin Client Sign-Off!
  const kycM1Id = ethers.id(`${kycV1Id}:milestone:1`);
  const kycM1Evidence = {
    milestoneId: kycM1Id,
    agreementId: kycV1Id,
    title: kycV1Payload.milestones[0].title,
    commitHash: '88b12f904e31a76d92c1108fa4b7712e9031ca55',
    repoUrl: 'https://github.com/novafin/kyc-vault/commit/88b12f904e31a76d92c1108fa4b7712e9031ca55',
    notes: 'Delivered AES-256-GCM envelope tokenizer + zero-PII audit middleware with full unit tests.',
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

  // Milestone 2 of KYC v1: PENDING
  const kycM2Id = ethers.id(`${kycV1Id}:milestone:2`);
  db.prepare(`
    INSERT INTO milestones (
      id, agreement_id, root_agreement_id, idx, title, deliverables, due_date, amount, status
    ) VALUES (?, ?, ?, 2, ?, ?, ?, ?, 'PENDING')
  `).run(
    kycM2Id,
    kycV1Id,
    kycV1Id,
    kycV1Payload.milestones[1].title,
    kycV1Payload.milestones[1].deliverables,
    kycV1Payload.milestones[1].dueDate,
    kycV1Payload.milestones[1].amount
  );

  // Pending Mutual Amendment Proposal (v2) proposed by NovaFin Labs awaiting Mili Nair's signature!
  const kycV2PropId = ethers.id('agreement:novafin-kyc:v2-proposal');
  const kycV2Payload = buildCanonicalAgreementPayload({
    version: 2,
    parentAgreementId: kycV1Id,
    title: 'Zero-Trust KYC Telemetry, Risk Scoring & Graph Collusion Detector',
    summary:
      'Amended agreement adding real-time Sybil ring graph detection alongside the PII Vault and gRPC risk scorer.',
    category: 'Cybersecurity & RegTech',
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
        name: 'Streaming Sybil & Collusion Graph Alerting',
        description: 'Bipartite graph cycle detector flagging synthetic identity rings in real time.',
        acceptanceCriteria: '<100ms cycle detection on 50k active nodes',
      },
    ],
    milestones: [
      ...kycV1Payload.milestones,
      {
        title: 'Milestone 3: Sybil Graph Detector & Webhook Alerts',
        deliverables: 'Graph ring analyzer module + Kafka alert producer',
        dueDate: '2026-12-19',
        amount: 180000,
      },
    ],
    clauses: {},
    amendmentReason:
      'Client requested adding Streaming Sybil Graph Detection (+₹1,80,000 budget increase and +14 days deadline extension). Requires Mili Nair co-signature to mint Agreement v2 on-chain.',
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

  insertAgreementStmt.run(
    kycV2PropId,
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

  // =========================================================================
  // SCENARIO 3: New Digital Agreement Proposal awaiting Freelancer Co-Signature (Acme <-> Arjun Verma)
  // =========================================================================
  const auditDraftId = ethers.id('agreement:acme-escrow-audit:v1');
  const auditPayload = buildCanonicalAgreementPayload({
    version: 1,
    parentAgreementId: null,
    title: 'Smart Contract Security Audit & Invariant Verification',
    summary: 'Comprehensive line-by-line audit and Foundry invariant fuzzing of Acme Multi-Sig Treasury contracts.',
    category: 'Blockchain & Smart Contracts',
    clientDid: acme.did,
    freelancerDid: arjun.did,
    startDate: '2026-11-26',
    deadline: '2026-12-20',
    durationDays: 24,
    totalCost: 480000,
    currency: 'INR',
    paymentSchedule: '50% Audit Report / 50% Fix Verification',
    features: [
      {
        name: 'Stateful Fuzzing & Symbolic Execution Suite',
        description: 'Property-based invariant tests covering reentrancy, signature replay, and access controls.',
        acceptanceCriteria: '100,000 fuzz runs with zero invariant violations',
      },
      {
        name: 'Cryptographic Remediation Sign-Off Report',
        description: 'Detailed severity breakdown and commit-pinned verification of patched contracts.',
        acceptanceCriteria: 'Signed PDF + JSON-LD audit summary',
      },
    ],
    milestones: [
      {
        title: 'Milestone 1: Initial Threat Model & Invariant Suite',
        deliverables: 'Foundry fuzz suite + preliminary findings report',
        dueDate: '2026-12-08',
        amount: 240000,
      },
      {
        title: 'Milestone 2: Final Fix Verification & Sign-Off',
        deliverables: 'Final audit report pinned to IPFS',
        dueDate: '2026-12-20',
        amount: 240000,
      },
    ],
    clauses: {},
    amendmentReason: '',
  });

  const { canonical: auditCanonical, hash: auditHash } = keccak256Json(auditPayload);
  const { cid: auditCid } = pinToIpfsVault(auditPayload, { type: 'DIGITAL_AGREEMENT_DRAFT', version: 1 });
  const auditDigest = computeInitialAgreementDigest({
    agreementId: auditDraftId,
    gigProvider: acme.address,
    freelancer: arjun.address,
    termsHash: auditHash,
  });
  const auditClientSig = await signDigestWithKey(acme.privateKey, auditDigest);

  insertAgreementStmt.run(
    auditDraftId,
    auditDraftId,
    null,
    null,
    1,
    auditPayload.title,
    auditPayload.summary,
    auditPayload.category,
    acme.did,
    acme.address,
    arjun.did,
    arjun.address,
    acme.did,
    auditPayload.timeline.startDate,
    auditPayload.timeline.deadline,
    auditPayload.timeline.durationDays,
    auditPayload.compensation.totalCost,
    auditPayload.compensation.currency,
    auditPayload.compensation.paymentSchedule,
    JSON.stringify(auditPayload.features),
    JSON.stringify(auditPayload.milestones),
    JSON.stringify(auditPayload.clauses),
    '',
    auditCanonical,
    auditHash,
    auditDigest,
    auditCid,
    auditClientSig,
    new Date((baseTs + 40000) * 1000).toISOString(),
    null,
    null,
    'PENDING_SIGNATURES',
    null,
    null,
    null,
    null,
    new Date((baseTs + 40000) * 1000).toISOString()
  );

  // =========================================================================
  // SCENARIO 4 (Slide 11): Zero-Knowledge Selective Disclosure Proof for Mili Nair
  // =========================================================================
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
    'Verified Enterprise Contract Value ≥ ₹10,00,000 (Confidential Client & Exact Amount Hidden)',
    'MIN_EARNINGS_INR',
    1000000,
    JSON.stringify(zkp, null, 2),
    zkp.publicCommitment,
    zkp.createdAt
  );

  console.log('[seed] TrustWork initial state anchored on EVM successfully.');
}
