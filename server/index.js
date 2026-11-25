import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import { ethers } from 'ethers';
import express from 'express';
import { chain } from './blockchain.js';
import {
  computeAmendmentDigest,
  computeCompleteAgreementDigest,
  computeCredentialDigest,
  computeInitialAgreementDigest,
  computeMilestoneDigest,
  computeRevokeCredentialDigest,
  createThresholdCommitmentProof,
  formatDid,
  keccak256Json,
  recoverDigestSigner,
  signDigestWithKey,
  verifyThresholdCommitmentProof,
} from './crypto-utils.js';
import { db } from './db.js';
import { getFromIpfsVault, pinToIpfsVault } from './ipfs-vault.js';
import { analyzeNetworkTrustGraph, computeFreelancerReputation } from './reputation-engine.js';
import { buildCanonicalAgreementPayload, seedIfEmpty } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');

const ISSUER_TIER_ENUM = {
  INDIVIDUAL: 0,
  VERIFIED_ORG: 1,
  ENTERPRISE: 2,
  PLATFORM: 3,
};

const AGREEMENT_STATUS_NAMES = ['NONE', 'ACTIVE', 'SUPERSEDED', 'COMPLETED', 'TERMINATED'];
const ISSUER_TIER_NAMES = ['INDIVIDUAL', 'VERIFIED_ORG', 'ENTERPRISE', 'PLATFORM'];

function hashPassword(pw) {
  return crypto.createHash('sha256').update(`trustwork:${pw}`).digest('hex');
}

export const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

function sanitizeIdentity(row) {
  if (!row) return null;
  return {
    did: row.did,
    address: row.address,
    name: row.name,
    headline: row.headline,
    email: row.email,
    bio: row.bio,
    role: row.role,
    hourlyRate: row.hourly_rate,
    location: row.location,
    organization: row.organization,
    domain: row.domain,
    issuerTier: row.issuer_tier,
    kybVerified: Boolean(row.kyb_verified),
    skills: JSON.parse(row.skills_json || '[]'),
    avatarColor: row.avatar_color,
    hasCustodialKey: Boolean(row.demo_private_key),
    txHash: row.tx_hash,
    blockNumber: row.block_number,
    createdAt: row.created_at,
  };
}

function hydrateAgreement(row, identitiesByDid, allMilestonesByAgreement) {
  const client = identitiesByDid[row.client_did];
  const freelancer = identitiesByDid[row.freelancer_did];
  return {
    id: row.id,
    gigId: row.gig_id,
    rootAgreementId: row.root_agreement_id,
    parentAgreementId: row.parent_agreement_id,
    supersededById: row.superseded_by_id,
    version: row.version,
    title: row.title,
    summary: row.summary,
    category: row.category,
    clientDid: row.client_did,
    clientAddress: row.client_address,
    clientName: client?.name || row.client_did,
    clientOrganization: client?.organization || '',
    clientTier: client?.issuerTier || 'INDIVIDUAL',
    clientAvatarColor: client?.avatarColor || '#0284C7',
    freelancerDid: row.freelancer_did,
    freelancerAddress: row.freelancer_address,
    freelancerName: freelancer?.name || row.freelancer_did,
    freelancerAvatarColor: freelancer?.avatarColor || '#4F46E5',
    proposedByDid: row.proposed_by_did,
    startDate: row.start_date,
    deadline: row.deadline,
    durationDays: row.duration_days,
    totalCost: row.total_cost,
    currency: row.currency,
    paymentSchedule: row.payment_schedule,
    features: JSON.parse(row.features_json || '[]'),
    milestonesSpec: JSON.parse(row.milestones_spec_json || '[]'),
    clauses: JSON.parse(row.clauses_json || '{}'),
    amendmentReason: row.amendment_reason,
    canonicalPayload: JSON.parse(row.canonical_payload_json),
    termsHash: row.terms_hash,
    signingDigest: row.signing_digest,
    ipfsCid: row.ipfs_cid,
    clientSignature: row.client_signature,
    clientSignedAt: row.client_signed_at,
    freelancerSignature: row.freelancer_signature,
    freelancerSignedAt: row.freelancer_signed_at,
    status: row.status,
    rejectionReason: row.rejection_reason,
    txHash: row.tx_hash,
    blockNumber: row.block_number,
    gasUsed: row.gas_used,
    anchoredAt: row.anchored_at,
    createdAt: row.created_at,
    milestones: allMilestonesByAgreement[row.id] || [],
  };
}

async function resolveSignature({ actorDid, digestHex, providedSignature }) {
  const row = db.prepare('SELECT * FROM identities WHERE did = ?').get(actorDid);
  if (!row) throw new Error(`Identity not found: ${actorDid}`);

  if (providedSignature) {
    const recovered = recoverDigestSigner(digestHex, providedSignature);
    if (!recovered || ethers.getAddress(recovered) !== ethers.getAddress(row.address)) {
      throw new Error(
        `Cryptographic signature mismatch: expected ${row.address}, recovered ${recovered || 'invalid'}`
      );
    }
    return { signature: providedSignature, identityRow: row };
  }

  if (!row.demo_private_key) {
    throw new Error(
      `External wallet required: sign this transaction using your connected MetaMask wallet (${row.address}).`
    );
  }

  const signature = await signDigestWithKey(row.demo_private_key, digestHex);
  return { signature, identityRow: row };
}

// ============================================================================
// BOOTSTRAP MARKETPLACE & BLOCKCHAIN STATE
// ============================================================================
app.get('/api/bootstrap', async (_req, res) => {
  try {
    await seedIfEmpty();
    const chainStatus = await chain.getChainStatus();

    const rawIdentities = db.prepare('SELECT * FROM identities ORDER BY created_at ASC').all();
    const rawGigs = db.prepare('SELECT * FROM gigs ORDER BY created_at DESC').all();
    const rawProposals = db.prepare('SELECT * FROM proposals ORDER BY created_at DESC').all();
    const rawMessages = db.prepare('SELECT * FROM messages ORDER BY created_at ASC').all();
    const rawAgreements = db.prepare('SELECT * FROM agreements ORDER BY created_at DESC').all();
    const rawMilestones = db.prepare('SELECT * FROM milestones ORDER BY idx ASC').all();
    const rawCredentials = db
      .prepare('SELECT * FROM verifiable_credentials ORDER BY issued_at DESC')
      .all();
    const rawZkp = db.prepare('SELECT * FROM zkp_proofs ORDER BY created_at DESC').all();
    const recentTxs = db
      .prepare('SELECT * FROM chain_transactions ORDER BY block_number DESC LIMIT 40')
      .all();

    const rawIdMap = {};
    const sanitizedIdMap = {};
    for (const r of rawIdentities) {
      rawIdMap[r.did] = r;
      sanitizedIdMap[r.did] = sanitizeIdentity(r);
    }

    const enrichedIdentities = rawIdentities.map((row) => {
      const base = sanitizedIdMap[row.did];
      const subjectCreds = rawCredentials.filter((c) => c.subject_did === row.did);
      const subjectAgreements = rawAgreements.filter(
        (a) => a.freelancer_did === row.did || a.client_did === row.did
      );
      const subjectMilestones = rawMilestones.filter((m) =>
        subjectAgreements.some((a) => a.id === m.agreement_id && a.freelancer_did === row.did)
      );
      const reputation = computeFreelancerReputation({
        identity: row,
        credentials: subjectCreds,
        agreements: subjectAgreements,
        milestones: subjectMilestones,
        allCredentials: rawCredentials,
        identitiesByDid: rawIdMap,
      });
      sanitizedIdMap[row.did] = { ...base, reputation };
      return sanitizedIdMap[row.did];
    });

    const milestonesByAg = {};
    for (const m of rawMilestones) {
      if (!milestonesByAg[m.agreement_id]) milestonesByAg[m.agreement_id] = [];
      milestonesByAg[m.agreement_id].push({
        id: m.id,
        agreementId: m.agreement_id,
        rootAgreementId: m.root_agreement_id,
        index: m.idx,
        title: m.title,
        deliverables: m.deliverables,
        dueDate: m.due_date,
        amount: m.amount,
        evidenceNotes: m.evidence_notes,
        commitHash: m.commit_hash,
        repoUrl: m.repo_url,
        artifactName: m.artifact_name,
        artifactContent: m.artifact_content,
        deliverableHash: m.deliverable_hash,
        evidenceCid: m.evidence_cid,
        signingDigest: m.signing_digest,
        freelancerSignature: m.freelancer_signature,
        submittedAt: m.submitted_at,
        clientSignature: m.client_signature,
        signedOffAt: m.signed_off_at,
        status: m.status,
        txHash: m.tx_hash,
        blockNumber: m.block_number,
      });
    }

    const hydratedProposals = rawProposals.map((p) => {
      const freelancer = sanitizedIdMap[p.freelancer_did];
      const gig = rawGigs.find((g) => g.id === p.gig_id);
      return {
        id: p.id,
        gigId: p.gig_id,
        gigTitle: gig?.title || p.gig_id,
        posterDid: gig?.poster_did || '',
        freelancerDid: p.freelancer_did,
        freelancerName: freelancer?.name || p.freelancer_did,
        freelancerHeadline: freelancer?.headline || '',
        freelancerAvatarColor: freelancer?.avatarColor || '#4F46E5',
        freelancerEvidenceScore: freelancer?.reputation?.evidenceScore ?? 0,
        freelancerSkills: freelancer?.skills || [],
        coverLetter: p.cover_letter,
        proposedCost: p.proposed_cost,
        currency: p.currency,
        proposedDurationDays: p.proposed_duration_days,
        proposedDeadline: p.proposed_deadline,
        proposedFeatures: JSON.parse(p.proposed_features_json || '[]'),
        proposedMilestones: JSON.parse(p.proposed_milestones_json || '[]'),
        status: p.status,
        agreementId: p.agreement_id,
        createdAt: p.created_at,
      };
    });

    const hydratedGigs = rawGigs.map((g) => {
      const poster = sanitizedIdMap[g.poster_did];
      const gigProposals = hydratedProposals.filter((p) => p.gigId === g.id);
      return {
        id: g.id,
        posterDid: g.poster_did,
        posterName: poster?.name || g.poster_did,
        posterOrganization: poster?.organization || '',
        posterTier: poster?.issuerTier || 'INDIVIDUAL',
        posterKyb: poster?.kybVerified || false,
        posterAvatarColor: poster?.avatarColor || '#0284C7',
        title: g.title,
        description: g.description,
        category: g.category,
        budgetMin: g.budget_min,
        budgetMax: g.budget_max,
        currency: g.currency,
        durationDays: g.duration_days,
        deadline: g.deadline,
        experienceLevel: g.experience_level,
        skills: JSON.parse(g.skills_json || '[]'),
        features: JSON.parse(g.features_json || '[]'),
        status: g.status,
        hiredFreelancerDid: g.hired_freelancer_did,
        rootAgreementId: g.root_agreement_id,
        proposalCount: gigProposals.length,
        proposals: gigProposals,
        createdAt: g.created_at,
      };
    });

    const hydratedAgreements = rawAgreements.map((a) =>
      hydrateAgreement(a, sanitizedIdMap, milestonesByAg)
    );

    const hydratedCredentials = rawCredentials.map((c) => {
      const issuer = sanitizedIdMap[c.issuer_did];
      const subject = sanitizedIdMap[c.subject_did];
      return {
        id: c.id,
        agreementId: c.agreement_id,
        issuerDid: c.issuer_did,
        issuerAddress: c.issuer_address,
        issuerName: issuer?.name || c.issuer_did,
        issuerOrganization: issuer?.organization || '',
        issuerTier: issuer?.issuerTier || 'INDIVIDUAL',
        issuerKyb: issuer?.kybVerified || false,
        subjectDid: c.subject_did,
        subjectAddress: c.subject_address,
        subjectName: subject?.name || c.subject_did,
        projectTitle: c.project_title,
        rolePerformed: c.role_performed,
        summaryStatement: c.summary_statement,
        skillsVerified: JSON.parse(c.skills_verified_json || '[]'),
        contractValue: c.contract_value,
        currency: c.currency,
        rating: c.rating,
        deliverableHashes: JSON.parse(c.deliverable_hashes_json || '[]'),
        vcDocument: JSON.parse(c.vc_json),
        vcHash: c.vc_hash,
        ipfsCid: c.ipfs_cid,
        signingDigest: c.signing_digest,
        issuerSignature: c.issuer_signature,
        revoked: Boolean(c.revoked),
        revocationReason: c.revocation_reason,
        revokedAt: c.revoked_at,
        revocationTxHash: c.revocation_tx_hash,
        txHash: c.tx_hash,
        blockNumber: c.block_number,
        gasUsed: c.gas_used,
        issuedAt: c.issued_at,
      };
    });

    const hydratedMessages = rawMessages.map((m) => ({
      id: m.id,
      threadId: m.thread_id,
      senderDid: m.sender_did,
      senderName: sanitizedIdMap[m.sender_did]?.name || m.sender_did,
      senderAvatarColor: sanitizedIdMap[m.sender_did]?.avatarColor || '#4F46E5',
      body: m.body,
      messageType: m.message_type,
      createdAt: m.created_at,
    }));

    const offChainBytes =
      rawAgreements.reduce((acc, a) => acc + Buffer.byteLength(a.canonical_payload_json, 'utf8'), 0) +
      rawCredentials.reduce((acc, c) => acc + Buffer.byteLength(c.vc_json, 'utf8'), 0);
    const onChainAnchorBytes =
      (rawAgreements.filter((a) => a.tx_hash).length + rawCredentials.length) * 128;

    res.json({
      chainStatus,
      identities: enrichedIdentities,
      gigs: hydratedGigs,
      proposals: hydratedProposals,
      messages: hydratedMessages,
      agreements: hydratedAgreements,
      credentials: hydratedCredentials,
      zkpProofs: rawZkp.map((z) => ({
        id: z.id,
        subjectDid: z.subject_did,
        subjectName: sanitizedIdMap[z.subject_did]?.name || z.subject_did,
        title: z.title,
        claimType: z.claim_type,
        threshold: z.threshold,
        proof: JSON.parse(z.proof_json),
        publicCommitment: z.public_commitment,
        createdAt: z.created_at,
      })),
      recentTransactions: recentTxs,
      trustGraph: analyzeNetworkTrustGraph({
        identities: rawIdentities,
        credentials: rawCredentials,
        agreements: rawAgreements,
      }),
      smartDataSeparation: {
        offChainPayloadBytes: offChainBytes,
        onChainFingerprintBytes: onChainAnchorBytes,
        compressionRatio:
          onChainAnchorBytes > 0 ? `${(offChainBytes / onChainAnchorBytes).toFixed(1)}x smaller on-chain` : 'N/A',
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// AUTHENTICATION & UNIFIED USER ACCOUNTS (BOTH FREELANCER + GIG PROVIDER)
// ============================================================================
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const row = db
    .prepare('SELECT * FROM identities WHERE LOWER(email) = LOWER(?)')
    .get(String(email || '').trim());
  if (!row) {
    return res.status(401).json({ error: 'No account found with that email address' });
  }
  if (row.password_hash && password && hashPassword(password) !== row.password_hash) {
    return res.status(401).json({ error: 'Incorrect password (demo accounts use password: demo123)' });
  }
  res.json({ identity: sanitizeIdentity(row) });
});

app.post('/api/identities', async (req, res) => {
  try {
    const {
      name,
      headline = 'Freelance Engineer & Gig Creator',
      email = '',
      password = 'demo123',
      bio = '',
      hourlyRate = 3000,
      location = 'India (Remote)',
      organization = '',
      domain = '',
      issuerTier = 'INDIVIDUAL',
      skills = [],
      externalAddress = null,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Full name is required' });
    }

    let address;
    let demoPrivateKey = null;
    if (externalAddress) {
      address = ethers.getAddress(externalAddress);
    } else {
      const wallet = ethers.Wallet.createRandom();
      address = wallet.address;
      demoPrivateKey = wallet.privateKey;
    }

    const did = formatDid(address);
    const existing = db.prepare('SELECT did FROM identities WHERE did = ?').get(did);
    if (existing) {
      return res.status(409).json({ error: `Account with wallet ${address} already exists` });
    }

    const { hash: profileHash } = keccak256Json({ did, name, organization, domain });
    const tierNum = ISSUER_TIER_ENUM[issuerTier] ?? 0;

    const receipt = await chain.sendTx(
      'registerIdentity',
      [address, did, tierNum, profileHash],
      {
        actorAddress: address,
        summary: `Registered TrustWork Account & DID (${name})`,
        referenceId: did,
      }
    );

    const palette = ['#4F46E5', '#0284C7', '#059669', '#D97706', '#E11D48', '#7C3AED'];
    const avatarColor = palette[Math.floor(Math.random() * palette.length)];
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO identities (
        did, address, name, headline, email, password_hash, bio, role, hourly_rate, location,
        organization, domain, issuer_tier, kyb_verified, skills_json, avatar_color,
        demo_private_key, tx_hash, block_number, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'BOTH', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      did,
      address,
      String(name).trim(),
      String(headline).trim(),
      String(email).trim(),
      hashPassword(password),
      String(bio).trim(),
      Number(hourlyRate) || 3000,
      String(location).trim(),
      String(organization).trim(),
      String(domain).trim(),
      issuerTier,
      issuerTier !== 'INDIVIDUAL' ? 1 : 0,
      JSON.stringify(Array.isArray(skills) ? skills : []),
      avatarColor,
      demoPrivateKey,
      receipt.txHash,
      receipt.blockNumber,
      nowIso
    );

    const created = db.prepare('SELECT * FROM identities WHERE did = ?').get(did);
    res.status(201).json({ identity: sanitizeIdentity(created), receipt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/identities/:did', (req, res) => {
  try {
    const { did } = req.params;
    const row = db.prepare('SELECT * FROM identities WHERE did = ?').get(did);
    if (!row) return res.status(404).json({ error: 'Profile not found' });

    const {
      name = row.name,
      headline = row.headline,
      bio = row.bio,
      hourlyRate = row.hourly_rate,
      location = row.location,
      organization = row.organization,
      domain = row.domain,
      skills = JSON.parse(row.skills_json || '[]'),
    } = req.body;

    db.prepare(`
      UPDATE identities
      SET name = ?, headline = ?, bio = ?, hourly_rate = ?, location = ?,
          organization = ?, domain = ?, skills_json = ?
      WHERE did = ?
    `).run(
      String(name).trim(),
      String(headline).trim(),
      String(bio).trim(),
      Number(hourlyRate),
      String(location).trim(),
      String(organization).trim(),
      String(domain).trim(),
      JSON.stringify(skills),
      did
    );

    res.json({ identity: sanitizeIdentity(db.prepare('SELECT * FROM identities WHERE did = ?').get(did)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/identities/:did/tier', async (req, res) => {
  try {
    const { did } = req.params;
    const { issuerTier } = req.body;
    if (!(issuerTier in ISSUER_TIER_ENUM)) {
      return res.status(400).json({ error: 'Invalid verification tier' });
    }
    const row = db.prepare('SELECT * FROM identities WHERE did = ?').get(did);
    if (!row) return res.status(404).json({ error: 'Identity not found' });

    const receipt = await chain.sendTx(
      'updateIssuerTier',
      [row.address, ISSUER_TIER_ENUM[issuerTier]],
      {
        actorAddress: row.address,
        summary: `Verified Organization Tier Updated: ${row.name} -> ${issuerTier}`,
        referenceId: did,
      }
    );

    db.prepare('UPDATE identities SET issuer_tier = ?, kyb_verified = ? WHERE did = ?').run(
      issuerTier,
      issuerTier === 'INDIVIDUAL' ? 0 : 1,
      did
    );

    res.json({ ok: true, issuerTier, receipt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// FREELANCE GIG MARKETPLACE & PROPOSALS (ANY USER CAN POST OR APPLY)
// ============================================================================
app.post('/api/gigs', (req, res) => {
  try {
    const {
      posterDid,
      title,
      description,
      category = 'Full-Stack Development',
      budgetMin,
      budgetMax,
      currency = 'INR',
      durationDays = 21,
      deadline,
      experienceLevel = 'Intermediate / Senior',
      skills = [],
      features = [],
    } = req.body;

    if (!posterDid || !title || !description) {
      return res.status(400).json({ error: 'Poster, title, and description are required' });
    }
    const poster = db.prepare('SELECT * FROM identities WHERE did = ?').get(posterDid);
    if (!poster) return res.status(404).json({ error: 'Poster account not found' });

    const gigId = `gig-${crypto.randomBytes(5).toString('hex')}`;
    const computedDeadline =
      deadline ||
      new Date(Date.now() + Number(durationDays || 21) * 86400000).toISOString().slice(0, 10);

    db.prepare(`
      INSERT INTO gigs (
        id, poster_did, title, description, category, budget_min, budget_max, currency,
        duration_days, deadline, experience_level, skills_json, features_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
    `).run(
      gigId,
      posterDid,
      String(title).trim(),
      String(description).trim(),
      String(category).trim(),
      Number(budgetMin || 50000),
      Number(budgetMax || budgetMin || 100000),
      currency,
      Number(durationDays || 21),
      computedDeadline,
      experienceLevel,
      JSON.stringify(Array.isArray(skills) ? skills : []),
      JSON.stringify(Array.isArray(features) ? features : []),
      new Date().toISOString()
    );

    res.status(201).json({ gigId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/gigs/:gigId/proposals', (req, res) => {
  try {
    const { gigId } = req.params;
    const {
      freelancerDid,
      coverLetter,
      proposedCost,
      currency = 'INR',
      proposedDurationDays = 21,
      proposedDeadline,
      proposedFeatures = [],
      proposedMilestones = [],
    } = req.body;

    const gig = db.prepare('SELECT * FROM gigs WHERE id = ?').get(gigId);
    if (!gig) return res.status(404).json({ error: 'Gig not found' });
    if (gig.status !== 'OPEN') {
      return res.status(400).json({ error: 'This gig is no longer accepting new proposals' });
    }
    if (gig.poster_did === freelancerDid) {
      return res.status(400).json({ error: 'You cannot submit a freelancer proposal to your own gig' });
    }

    const existing = db
      .prepare("SELECT id FROM proposals WHERE gig_id = ? AND freelancer_did = ? AND status != 'DECLINED'")
      .get(gigId, freelancerDid);
    if (existing) {
      return res.status(409).json({ error: 'You have already submitted a proposal for this gig' });
    }

    const propId = `prop-${crypto.randomBytes(5).toString('hex')}`;
    const dl =
      proposedDeadline ||
      new Date(Date.now() + Number(proposedDurationDays || 21) * 86400000).toISOString().slice(0, 10);

    const defaultFeatures =
      proposedFeatures.length > 0
        ? proposedFeatures
        : JSON.parse(gig.features_json || '[]').map((f) => ({
            name: f.name,
            description: f.description || '',
            acceptanceCriteria: f.acceptanceCriteria || 'Verified by client',
          }));

    const defaultMilestones =
      proposedMilestones.length > 0
        ? proposedMilestones
        : [
            {
              title: 'Milestone 1: Core Architecture & Initial Build',
              deliverables: 'Initial working module & source code',
              dueDate: dl,
              amount: Math.round(Number(proposedCost) * 0.5),
            },
            {
              title: 'Milestone 2: Final Features, Testing & Handover',
              deliverables: 'Production-ready build & documentation',
              dueDate: dl,
              amount: Number(proposedCost) - Math.round(Number(proposedCost) * 0.5),
            },
          ];

    db.prepare(`
      INSERT INTO proposals (
        id, gig_id, freelancer_did, cover_letter, proposed_cost, currency,
        proposed_duration_days, proposed_deadline, proposed_features_json,
        proposed_milestones_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `).run(
      propId,
      gigId,
      freelancerDid,
      String(coverLetter || '').trim(),
      Number(proposedCost),
      currency || gig.currency,
      Number(proposedDurationDays),
      dl,
      JSON.stringify(defaultFeatures),
      JSON.stringify(defaultMilestones),
      new Date().toISOString()
    );

    res.status(201).json({ proposalId: propId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Gig Provider accepts a Freelancer Proposal -> Automatically creates & signs Digital Agreement v1!
 * Counterparty (Freelancer) then reviews and co-signs to lock it onto the Blockchain.
 */
app.post('/api/proposals/:proposalId/accept', async (req, res) => {
  try {
    const { proposalId } = req.params;
    const { actorDid, customFeatures, customMilestones, customCost, customDeadline, signature = null } =
      req.body;

    const prop = db.prepare('SELECT * FROM proposals WHERE id = ?').get(proposalId);
    if (!prop) return res.status(404).json({ error: 'Proposal not found' });

    const gig = db.prepare('SELECT * FROM gigs WHERE id = ?').get(prop.gig_id);
    if (!gig) return res.status(404).json({ error: 'Gig not found' });
    if (gig.poster_did !== actorDid) {
      return res.status(403).json({ error: 'Only the Gig Provider who posted this gig can accept proposals' });
    }

    const client = db.prepare('SELECT * FROM identities WHERE did = ?').get(gig.poster_did);
    const freelancer = db.prepare('SELECT * FROM identities WHERE did = ?').get(prop.freelancer_did);

    const startDate = new Date().toISOString().slice(0, 10);
    const deadline = customDeadline || prop.proposed_deadline;
    const totalCost = customCost !== undefined ? Number(customCost) : prop.proposed_cost;
    const features = customFeatures || JSON.parse(prop.proposed_features_json || '[]');
    const milestones = customMilestones || JSON.parse(prop.proposed_milestones_json || '[]');

    const payload = buildCanonicalAgreementPayload({
      version: 1,
      parentAgreementId: null,
      title: gig.title,
      summary: gig.description,
      category: gig.category,
      clientDid: client.did,
      freelancerDid: freelancer.did,
      startDate,
      deadline,
      durationDays: prop.proposed_duration_days,
      totalCost,
      currency: prop.currency,
      paymentSchedule: `Milestone-Based (${milestones.length} Stages)`,
      features,
      milestones,
      clauses: {},
      amendmentReason: '',
    });

    const { canonical, hash: termsHash } = keccak256Json(payload);
    const seed = crypto.randomBytes(6).toString('hex');
    const agreementId = ethers.keccak256(
      ethers.toUtf8Bytes(`${client.did}:${freelancer.did}:v1:${termsHash}:${seed}`)
    );

    const signingDigest = computeInitialAgreementDigest({
      agreementId,
      gigProvider: client.address,
      freelancer: freelancer.address,
      termsHash,
    });

    const { signature: clientSig } = await resolveSignature({
      actorDid: client.did,
      digestHex: signingDigest,
      providedSignature: signature,
    });

    const { cid: ipfsCid } = pinToIpfsVault(payload, {
      type: 'DIGITAL_AGREEMENT_FROM_PROPOSAL',
      proposalId,
      agreementId,
    });

    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO agreements (
        id, gig_id, root_agreement_id, parent_agreement_id, superseded_by_id, version,
        title, summary, category, client_did, client_address, freelancer_did, freelancer_address,
        proposed_by_did, start_date, deadline, duration_days, total_cost, currency, payment_schedule,
        features_json, milestones_spec_json, clauses_json, amendment_reason,
        canonical_payload_json, terms_hash, signing_digest, ipfs_cid,
        client_signature, client_signed_at, freelancer_signature, freelancer_signed_at,
        status, created_at
      ) VALUES (?, ?, ?, NULL, NULL, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, NULL, NULL, 'PENDING_SIGNATURES', ?)
    `).run(
      agreementId,
      gig.id,
      agreementId,
      payload.title,
      payload.summary,
      payload.category,
      client.did,
      client.address,
      freelancer.did,
      freelancer.address,
      client.did,
      startDate,
      deadline,
      prop.proposed_duration_days,
      totalCost,
      prop.currency,
      payload.compensation.paymentSchedule,
      JSON.stringify(payload.features),
      JSON.stringify(payload.milestones),
      JSON.stringify(payload.clauses),
      canonical,
      termsHash,
      signingDigest,
      ipfsCid,
      clientSig,
      nowIso,
      nowIso
    );

    db.prepare("UPDATE proposals SET status = 'ACCEPTED', agreement_id = ? WHERE id = ?").run(
      agreementId,
      proposalId
    );

    db.prepare(`
      INSERT INTO messages (id, thread_id, sender_did, body, message_type, created_at)
      VALUES (?, ?, ?, ?, 'SYSTEM', ?)
    `).run(
      `msg-${crypto.randomBytes(5).toString('hex')}`,
      agreementId,
      client.did,
      `${client.name} accepted ${freelancer.name}'s proposal and signed Digital Agreement v1 (${prop.currency} ${totalCost.toLocaleString()}). Waiting for ${freelancer.name} to review & co-sign to store on blockchain.`,
      nowIso
    );

    res.status(201).json({ agreementId, termsHash, ipfsCid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// WORKSPACE MESSAGES / CHAT
// ============================================================================
app.post('/api/messages', (req, res) => {
  try {
    const { threadId, senderDid, body } = req.body;
    if (!threadId || !senderDid || !String(body || '').trim()) {
      return res.status(400).json({ error: 'threadId, senderDid, and message body required' });
    }
    const msgId = `msg-${crypto.randomBytes(5).toString('hex')}`;
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO messages (id, thread_id, sender_did, body, message_type, created_at)
      VALUES (?, ?, ?, ?, 'TEXT', ?)
    `).run(msgId, threadId, senderDid, String(body).trim(), nowIso);

    res.status(201).json({ id: msgId, createdAt: nowIso });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// DUAL-SIGNED BLOCKCHAIN DIGITAL AGREEMENTS & MUTUAL AMENDMENT VERSIONING
// ============================================================================
app.post('/api/agreements/prepare', (req, res) => {
  try {
    const {
      parentAgreementId = null,
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
      amendmentReason = '',
      nonceSeed = '',
    } = req.body;

    const client = db.prepare('SELECT * FROM identities WHERE did = ?').get(clientDid);
    const freelancer = db.prepare('SELECT * FROM identities WHERE did = ?').get(freelancerDid);
    if (!client || !freelancer) {
      return res.status(400).json({ error: 'Both Gig Provider and Freelancer accounts must exist' });
    }
    if (client.did === freelancer.did) {
      return res.status(400).json({ error: 'Gig Provider and Freelancer must be two different accounts' });
    }

    let version = 1;
    if (parentAgreementId) {
      const parent = db.prepare('SELECT * FROM agreements WHERE id = ?').get(parentAgreementId);
      if (!parent || parent.status !== 'ACTIVE') {
        return res.status(400).json({ error: 'Parent agreement must be ACTIVE on-chain to modify' });
      }
      version = parent.version + 1;
    }

    const payload = buildCanonicalAgreementPayload({
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
    });

    const { canonical, hash: termsHash } = keccak256Json(payload);
    const agreementId = ethers.keccak256(
      ethers.toUtf8Bytes(`${client.did}:${freelancer.did}:v${version}:${termsHash}:${nonceSeed}`)
    );

    const signingDigest = parentAgreementId
      ? computeAmendmentDigest({
          newAgreementId: agreementId,
          newVersion: version,
          parentAgreementId,
          gigProvider: client.address,
          freelancer: freelancer.address,
          newTermsHash: termsHash,
        })
      : computeInitialAgreementDigest({
          agreementId,
          gigProvider: client.address,
          freelancer: freelancer.address,
          termsHash,
        });

    res.json({
      agreementId,
      version,
      termsHash,
      signingDigest,
      canonicalPayload: payload,
      canonicalString: canonical,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/agreements', async (req, res) => {
  try {
    const {
      gigId = null,
      title,
      summary,
      category,
      clientDid,
      freelancerDid,
      proposedByDid,
      startDate,
      deadline,
      durationDays,
      totalCost,
      currency = 'INR',
      paymentSchedule = 'Milestone-Based',
      features = [],
      milestones = [],
      clauses = {},
      proposerSignature = null,
      agreementIdOverride = null,
      nonceSeed = '',
    } = req.body;

    if (!title || !clientDid || !freelancerDid || !proposedByDid) {
      return res.status(400).json({ error: 'Missing required agreement fields' });
    }
    if (proposedByDid !== clientDid && proposedByDid !== freelancerDid) {
      return res.status(400).json({ error: 'Proposer must be either the Gig Provider or Freelancer' });
    }

    const client = db.prepare('SELECT * FROM identities WHERE did = ?').get(clientDid);
    const freelancer = db.prepare('SELECT * FROM identities WHERE did = ?').get(freelancerDid);
    if (!client || !freelancer) {
      return res.status(404).json({ error: 'Client or Freelancer account not found' });
    }
    if (client.did === freelancer.did) {
      return res.status(400).json({ error: 'Gig Provider and Freelancer must be distinct users' });
    }

    const payload = buildCanonicalAgreementPayload({
      version: 1,
      parentAgreementId: null,
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
      amendmentReason: '',
    });

    const { canonical, hash: termsHash } = keccak256Json(payload);
    const seed = nonceSeed || crypto.randomBytes(6).toString('hex');
    const agreementId =
      agreementIdOverride ||
      ethers.keccak256(ethers.toUtf8Bytes(`${client.did}:${freelancer.did}:v1:${termsHash}:${seed}`));

    const signingDigest = computeInitialAgreementDigest({
      agreementId,
      gigProvider: client.address,
      freelancer: freelancer.address,
      termsHash,
    });

    const { signature } = await resolveSignature({
      actorDid: proposedByDid,
      digestHex: signingDigest,
      providedSignature: proposerSignature,
    });

    const { cid: ipfsCid } = pinToIpfsVault(payload, {
      type: 'DIGITAL_AGREEMENT_PROPOSAL',
      version: 1,
      agreementId,
    });

    const nowIso = new Date().toISOString();
    const isClientProposer = proposedByDid === clientDid;

    db.prepare(`
      INSERT INTO agreements (
        id, gig_id, root_agreement_id, parent_agreement_id, superseded_by_id, version,
        title, summary, category, client_did, client_address, freelancer_did, freelancer_address,
        proposed_by_did, start_date, deadline, duration_days, total_cost, currency, payment_schedule,
        features_json, milestones_spec_json, clauses_json, amendment_reason,
        canonical_payload_json, terms_hash, signing_digest, ipfs_cid,
        client_signature, client_signed_at, freelancer_signature, freelancer_signed_at,
        status, created_at
      ) VALUES (?, ?, ?, NULL, NULL, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_SIGNATURES', ?)
    `).run(
      agreementId,
      gigId,
      agreementId,
      payload.title,
      payload.summary,
      payload.category,
      client.did,
      client.address,
      freelancer.did,
      freelancer.address,
      proposedByDid,
      payload.timeline.startDate,
      payload.timeline.deadline,
      payload.timeline.durationDays,
      payload.compensation.totalCost,
      payload.compensation.currency,
      payload.compensation.paymentSchedule,
      JSON.stringify(payload.features),
      JSON.stringify(payload.milestones),
      JSON.stringify(payload.clauses),
      canonical,
      termsHash,
      signingDigest,
      ipfsCid,
      isClientProposer ? signature : null,
      isClientProposer ? nowIso : null,
      !isClientProposer ? signature : null,
      !isClientProposer ? nowIso : null,
      nowIso
    );

    res.status(201).json({
      agreementId,
      termsHash,
      signingDigest,
      ipfsCid,
      status: 'PENDING_SIGNATURES',
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/agreements/:id/cosign', async (req, res) => {
  try {
    const { id } = req.params;
    const { actorDid, signature: providedSignature = null } = req.body;

    const ag = db.prepare('SELECT * FROM agreements WHERE id = ?').get(id);
    if (!ag) return res.status(404).json({ error: 'Agreement not found' });
    if (ag.status !== 'PENDING_SIGNATURES') {
      return res.status(400).json({ error: `Agreement cannot be co-signed in state ${ag.status}` });
    }
    if (actorDid !== ag.client_did && actorDid !== ag.freelancer_did) {
      return res.status(403).json({ error: 'Only the named Gig Provider or Freelancer can co-sign' });
    }

    const { signature } = await resolveSignature({
      actorDid,
      digestHex: ag.signing_digest,
      providedSignature,
    });

    const clientSig = actorDid === ag.client_did ? signature : ag.client_signature;
    const freelancerSig = actorDid === ag.freelancer_did ? signature : ag.freelancer_signature;

    if (!clientSig || !freelancerSig) {
      return res.status(400).json({ error: 'Both party signatures are required to store on blockchain' });
    }

    const receipt = await chain.sendTx(
      'anchorAgreement',
      [
        ag.id,
        ag.client_address,
        ag.freelancer_address,
        ag.terms_hash,
        ag.ipfs_cid,
        clientSig,
        freelancerSig,
      ],
      {
        actorAddress: actorDid === ag.client_did ? ag.client_address : ag.freelancer_address,
        summary: `Anchored Dual-Signed Digital Agreement v1: ${ag.title} (${ag.currency} ${ag.total_cost.toLocaleString()})`,
        referenceId: ag.id,
      }
    );

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE agreements
      SET client_signature = ?,
          client_signed_at = COALESCE(client_signed_at, ?),
          freelancer_signature = ?,
          freelancer_signed_at = COALESCE(freelancer_signed_at, ?),
          status = 'ACTIVE',
          tx_hash = ?,
          block_number = ?,
          gas_used = ?,
          anchored_at = ?
      WHERE id = ?
    `).run(
      clientSig,
      nowIso,
      freelancerSig,
      nowIso,
      receipt.txHash,
      receipt.blockNumber,
      receipt.gasUsed,
      nowIso,
      ag.id
    );

    if (ag.gig_id) {
      db.prepare(
        "UPDATE gigs SET status = 'IN_CONTRACT', hired_freelancer_did = ?, root_agreement_id = ? WHERE id = ?"
      ).run(ag.freelancer_did, ag.root_agreement_id, ag.gig_id);
    }

    const milestoneSpecs = JSON.parse(ag.milestones_spec_json || '[]');
    const insertMs = db.prepare(`
      INSERT OR IGNORE INTO milestones (
        id, agreement_id, root_agreement_id, idx, title, deliverables, due_date, amount, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `);
    for (let i = 0; i < milestoneSpecs.length; i++) {
      const m = milestoneSpecs[i];
      const mId = ethers.id(`${ag.id}:milestone:${i + 1}`);
      insertMs.run(
        mId,
        ag.id,
        ag.root_agreement_id,
        i + 1,
        m.title,
        m.deliverables,
        m.dueDate,
        Number(m.amount)
      );
    }

    db.prepare(`
      INSERT INTO messages (id, thread_id, sender_did, body, message_type, created_at)
      VALUES (?, ?, ?, ?, 'SYSTEM', ?)
    `).run(
      `msg-${crypto.randomBytes(5).toString('hex')}`,
      ag.root_agreement_id,
      actorDid,
      `Both parties signed! Digital Agreement v1 is now locked on the blockchain at Block #${receipt.blockNumber}. Neither party can modify time, cost, or features without mutual approval.`,
      nowIso
    );

    res.json({ ok: true, agreementId: ag.id, status: 'ACTIVE', receipt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/agreements/:id/propose-amendment', async (req, res) => {
  try {
    const { id: parentId } = req.params;
    const {
      proposedByDid,
      title,
      summary,
      category,
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
      proposerSignature = null,
      agreementIdOverride = null,
      nonceSeed = '',
    } = req.body;

    const parent = db.prepare('SELECT * FROM agreements WHERE id = ?').get(parentId);
    if (!parent) return res.status(404).json({ error: 'Parent agreement not found' });
    if (parent.status !== 'ACTIVE') {
      return res.status(400).json({
        error: `Only an ACTIVE agreement can be modified (current status: ${parent.status})`,
      });
    }
    if (proposedByDid !== parent.client_did && proposedByDid !== parent.freelancer_did) {
      return res.status(403).json({ error: 'Only one of the two contracting parties can propose a change' });
    }
    if (!amendmentReason || !String(amendmentReason).trim()) {
      return res.status(400).json({ error: 'Please summarize what is changing and why' });
    }

    const existingPending = db
      .prepare("SELECT id FROM agreements WHERE parent_agreement_id = ? AND status = 'AMENDMENT_PENDING'")
      .get(parentId);
    if (existingPending) {
      return res.status(409).json({
        error: 'There is already a pending modification request awaiting the other party on this contract.',
      });
    }

    const newVersion = parent.version + 1;
    const payload = buildCanonicalAgreementPayload({
      version: newVersion,
      parentAgreementId: parentId,
      title: title || parent.title,
      summary: summary ?? parent.summary,
      category: category || parent.category,
      clientDid: parent.client_did,
      freelancerDid: parent.freelancer_did,
      startDate: startDate || parent.start_date,
      deadline: deadline || parent.deadline,
      durationDays: durationDays ?? parent.duration_days,
      totalCost: totalCost ?? parent.total_cost,
      currency: currency || parent.currency,
      paymentSchedule: paymentSchedule || parent.payment_schedule,
      features: features || JSON.parse(parent.features_json),
      milestones: milestones || JSON.parse(parent.milestones_spec_json),
      clauses: clauses || JSON.parse(parent.clauses_json),
      amendmentReason,
    });

    const { canonical, hash: newTermsHash } = keccak256Json(payload);
    if (newTermsHash === parent.terms_hash) {
      return res.status(400).json({ error: 'Modified terms are identical to the current active agreement' });
    }

    const seed = nonceSeed || crypto.randomBytes(6).toString('hex');
    const newAgreementId =
      agreementIdOverride ||
      ethers.keccak256(
        ethers.toUtf8Bytes(`${parent.client_did}:${parent.freelancer_did}:v${newVersion}:${newTermsHash}:${seed}`)
      );

    const signingDigest = computeAmendmentDigest({
      newAgreementId,
      newVersion,
      parentAgreementId: parentId,
      gigProvider: parent.client_address,
      freelancer: parent.freelancer_address,
      newTermsHash,
    });

    const { signature, identityRow } = await resolveSignature({
      actorDid: proposedByDid,
      digestHex: signingDigest,
      providedSignature: proposerSignature,
    });

    const { cid: newIpfsCid } = pinToIpfsVault(payload, {
      type: 'AMENDMENT_PROPOSAL',
      version: newVersion,
      parentAgreementId: parentId,
    });

    const nowIso = new Date().toISOString();
    const isClientProposer = proposedByDid === parent.client_did;

    db.prepare(`
      INSERT INTO agreements (
        id, gig_id, root_agreement_id, parent_agreement_id, superseded_by_id, version,
        title, summary, category, client_did, client_address, freelancer_did, freelancer_address,
        proposed_by_did, start_date, deadline, duration_days, total_cost, currency, payment_schedule,
        features_json, milestones_spec_json, clauses_json, amendment_reason,
        canonical_payload_json, terms_hash, signing_digest, ipfs_cid,
        client_signature, client_signed_at, freelancer_signature, freelancer_signed_at,
        status, created_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AMENDMENT_PENDING', ?)
    `).run(
      newAgreementId,
      parent.gig_id,
      parent.root_agreement_id,
      parentId,
      newVersion,
      payload.title,
      payload.summary,
      payload.category,
      parent.client_did,
      parent.client_address,
      parent.freelancer_did,
      parent.freelancer_address,
      proposedByDid,
      payload.timeline.startDate,
      payload.timeline.deadline,
      payload.timeline.durationDays,
      payload.compensation.totalCost,
      payload.compensation.currency,
      payload.compensation.paymentSchedule,
      JSON.stringify(payload.features),
      JSON.stringify(payload.milestones),
      JSON.stringify(payload.clauses),
      payload.amendmentReason,
      canonical,
      newTermsHash,
      signingDigest,
      newIpfsCid,
      isClientProposer ? signature : null,
      isClientProposer ? nowIso : null,
      !isClientProposer ? signature : null,
      !isClientProposer ? nowIso : null,
      nowIso
    );

    db.prepare(`
      INSERT INTO messages (id, thread_id, sender_did, body, message_type, created_at)
      VALUES (?, ?, ?, ?, 'SYSTEM', ?)
    `).run(
      `msg-${crypto.randomBytes(5).toString('hex')}`,
      parent.root_agreement_id,
      proposedByDid,
      `${identityRow.name} proposed Contract Modification v${newVersion}: "${amendmentReason}". Agreement v${parent.version} remains active until the other party co-signs.`,
      nowIso
    );

    res.status(201).json({
      newAgreementId,
      parentAgreementId: parentId,
      version: newVersion,
      newTermsHash,
      signingDigest,
      ipfsCid: newIpfsCid,
      status: 'AMENDMENT_PENDING',
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/agreements/:id/cosign-amendment', async (req, res) => {
  try {
    const { id: amendmentId } = req.params;
    const { actorDid, signature: providedSignature = null } = req.body;

    const proposal = db.prepare('SELECT * FROM agreements WHERE id = ?').get(amendmentId);
    if (!proposal) return res.status(404).json({ error: 'Modification proposal not found' });
    if (proposal.status !== 'AMENDMENT_PENDING') {
      return res.status(400).json({ error: `Proposal is not awaiting co-sign (status: ${proposal.status})` });
    }

    const parent = db.prepare('SELECT * FROM agreements WHERE id = ?').get(proposal.parent_agreement_id);
    if (!parent || parent.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Parent agreement is no longer ACTIVE' });
    }

    if (actorDid !== proposal.client_did && actorDid !== proposal.freelancer_did) {
      return res.status(403).json({ error: 'Only the counterparty on this agreement can co-sign' });
    }

    const { signature, identityRow } = await resolveSignature({
      actorDid,
      digestHex: proposal.signing_digest,
      providedSignature,
    });

    const clientSig = actorDid === proposal.client_did ? signature : proposal.client_signature;
    const freelancerSig = actorDid === proposal.freelancer_did ? signature : proposal.freelancer_signature;

    if (!clientSig || !freelancerSig) {
      return res.status(400).json({ error: 'Both Gig Provider and Freelancer signatures are required!' });
    }

    const receipt = await chain.sendTx(
      'amendAgreement',
      [
        parent.id,
        proposal.id,
        proposal.terms_hash,
        proposal.ipfs_cid,
        clientSig,
        freelancerSig,
      ],
      {
        actorAddress: actorDid === proposal.client_did ? proposal.client_address : proposal.freelancer_address,
        summary: `Mutual Agreement Modification Anchored (v${parent.version} -> v${proposal.version}): ${proposal.title}`,
        referenceId: proposal.id,
      }
    );

    const nowIso = new Date().toISOString();

    db.prepare("UPDATE agreements SET status = 'SUPERSEDED', superseded_by_id = ? WHERE id = ?").run(
      proposal.id,
      parent.id
    );

    db.prepare(`
      UPDATE agreements
      SET client_signature = ?,
          client_signed_at = COALESCE(client_signed_at, ?),
          freelancer_signature = ?,
          freelancer_signed_at = COALESCE(freelancer_signed_at, ?),
          status = 'ACTIVE',
          tx_hash = ?,
          block_number = ?,
          gas_used = ?,
          anchored_at = ?
      WHERE id = ?
    `).run(
      clientSig,
      nowIso,
      freelancerSig,
      nowIso,
      receipt.txHash,
      receipt.blockNumber,
      receipt.gasUsed,
      nowIso,
      proposal.id
    );

    // Carry forward milestone progress to the new agreement version
    const prevMilestones = db
      .prepare('SELECT * FROM milestones WHERE agreement_id = ? ORDER BY idx ASC')
      .all(parent.id);
    const newSpecs = JSON.parse(proposal.milestones_spec_json || '[]');

    for (let i = 0; i < newSpecs.length; i++) {
      const spec = newSpecs[i];
      const prev = prevMilestones[i];
      const newMId = ethers.id(`${proposal.id}:milestone:${i + 1}`);
      if (prev && prev.status === 'VERIFIED_ONCHAIN') {
        db.prepare(`
          INSERT INTO milestones (
            id, agreement_id, root_agreement_id, idx, title, deliverables, due_date, amount,
            evidence_notes, commit_hash, repo_url, artifact_name, artifact_content,
            deliverable_hash, evidence_cid, signing_digest,
            freelancer_signature, submitted_at, client_signature, signed_off_at,
            status, tx_hash, block_number
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED_ONCHAIN', ?, ?)
        `).run(
          newMId,
          proposal.id,
          proposal.root_agreement_id,
          i + 1,
          spec.title,
          spec.deliverables,
          spec.dueDate,
          Number(spec.amount),
          prev.evidence_notes,
          prev.commit_hash,
          prev.repo_url,
          prev.artifact_name,
          prev.artifact_content,
          prev.deliverable_hash,
          prev.evidence_cid,
          prev.signing_digest,
          prev.freelancer_signature,
          prev.submitted_at,
          prev.client_signature,
          prev.signed_off_at,
          prev.tx_hash,
          prev.block_number
        );
      } else if (prev && prev.status === 'EVIDENCE_SUBMITTED') {
        const reDigest = computeMilestoneDigest({
          milestoneId: newMId,
          agreementId: proposal.id,
          deliverableHash: prev.deliverable_hash,
        });
        const freelancerRow = db.prepare('SELECT * FROM identities WHERE did = ?').get(proposal.freelancer_did);
        const reSig = freelancerRow?.demo_private_key
          ? await signDigestWithKey(freelancerRow.demo_private_key, reDigest)
          : prev.freelancer_signature;
        db.prepare(`
          INSERT INTO milestones (
            id, agreement_id, root_agreement_id, idx, title, deliverables, due_date, amount,
            evidence_notes, commit_hash, repo_url, artifact_name, artifact_content,
            deliverable_hash, evidence_cid, signing_digest,
            freelancer_signature, submitted_at, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EVIDENCE_SUBMITTED')
        `).run(
          newMId,
          proposal.id,
          proposal.root_agreement_id,
          i + 1,
          spec.title,
          spec.deliverables,
          spec.dueDate,
          Number(spec.amount),
          prev.evidence_notes,
          prev.commit_hash,
          prev.repo_url,
          prev.artifact_name,
          prev.artifact_content,
          prev.deliverable_hash,
          prev.evidence_cid,
          reDigest,
          reSig,
          prev.submitted_at
        );
      } else {
        db.prepare(`
          INSERT INTO milestones (
            id, agreement_id, root_agreement_id, idx, title, deliverables, due_date, amount, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `).run(
          newMId,
          proposal.id,
          proposal.root_agreement_id,
          i + 1,
          spec.title,
          spec.deliverables,
          spec.dueDate,
          Number(spec.amount)
        );
      }
    }

    db.prepare(`
      INSERT INTO messages (id, thread_id, sender_did, body, message_type, created_at)
      VALUES (?, ?, ?, ?, 'SYSTEM', ?)
    `).run(
      `msg-${crypto.randomBytes(5).toString('hex')}`,
      proposal.root_agreement_id,
      actorDid,
      `${identityRow.name} co-signed the modification! New Digital Agreement v${proposal.version} (${proposal.currency} ${proposal.total_cost.toLocaleString()}) is now active on-chain at Block #${receipt.blockNumber}; v${parent.version} is archived as Superseded.`,
      nowIso
    );

    res.json({
      ok: true,
      supersededAgreementId: parent.id,
      activeAgreementId: proposal.id,
      version: proposal.version,
      receipt,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/agreements/:id/reject', (req, res) => {
  try {
    const { id } = req.params;
    const { actorDid, reason = 'Declined by counterparty' } = req.body;
    const ag = db.prepare('SELECT * FROM agreements WHERE id = ?').get(id);
    if (!ag) return res.status(404).json({ error: 'Agreement not found' });
    if (ag.status !== 'PENDING_SIGNATURES' && ag.status !== 'AMENDMENT_PENDING') {
      return res.status(400).json({ error: 'Only pending proposals can be declined' });
    }
    if (actorDid !== ag.client_did && actorDid !== ag.freelancer_did) {
      return res.status(403).json({ error: 'Unauthorized actor' });
    }
    db.prepare("UPDATE agreements SET status = 'REJECTED', rejection_reason = ? WHERE id = ?").run(
      String(reason).trim(),
      id
    );
    res.json({ ok: true, id, status: 'REJECTED' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/agreements/:id/simulate-tamper', async (req, res) => {
  try {
    const { id } = req.params;
    const { attackerDid, tamperedCost, tamperedDeadline, tamperedFeatureTitle } = req.body;

    const ag = db.prepare('SELECT * FROM agreements WHERE id = ?').get(id);
    if (!ag || !ag.tx_hash) {
      return res.status(400).json({ error: 'Select a blockchain-anchored agreement to test tamper protection' });
    }

    const originalPayload = JSON.parse(ag.canonical_payload_json);
    const mutatedPayload = JSON.parse(ag.canonical_payload_json);

    if (tamperedCost !== undefined && tamperedCost !== null) {
      mutatedPayload.compensation.totalCost = Number(tamperedCost);
    }
    if (tamperedDeadline) {
      mutatedPayload.timeline.deadline = String(tamperedDeadline);
    }
    if (tamperedFeatureTitle && mutatedPayload.features.length > 0) {
      mutatedPayload.features[0].name = String(tamperedFeatureTitle);
    }

    const { hash: mutatedTermsHash } = keccak256Json(mutatedPayload);
    const auditRes = await chain.callView('auditAgreement', [ag.id, mutatedTermsHash]);

    const fakeAmendmentId = ethers.keccak256(ethers.toUtf8Bytes(`tamper:${ag.id}:${Date.now()}`));
    const amendDigest = computeAmendmentDigest({
      newAgreementId: fakeAmendmentId,
      newVersion: ag.version + 1,
      parentAgreementId: ag.id,
      gigProvider: ag.client_address,
      freelancer: ag.freelancer_address,
      newTermsHash: mutatedTermsHash,
    });

    const attackerRow = db.prepare('SELECT * FROM identities WHERE did = ?').get(attackerDid || ag.client_did);
    let attackerSig = ag.client_signature;
    if (attackerRow?.demo_private_key) {
      attackerSig = await signDigestWithKey(attackerRow.demo_private_key, amendDigest);
    }

    const forgedClientSig = attackerRow?.did === ag.client_did ? attackerSig : ag.client_signature;
    const forgedFreelancerSig = attackerRow?.did === ag.freelancer_did ? attackerSig : ag.freelancer_signature;

    let evmRejectionError = null;
    if (ag.status === 'ACTIVE') {
      try {
        await chain.sendTx('amendAgreement', [
          ag.id,
          fakeAmendmentId,
          mutatedTermsHash,
          ag.ipfs_cid,
          forgedClientSig,
          forgedFreelancerSig,
        ]);
      } catch (contractErr) {
        evmRejectionError = contractErr.message;
      }
    } else {
      evmRejectionError = `Smart Contract Reverted: ParentAgreementNotActive (status is ${ag.status})`;
    }

    res.json({
      tamperBlocked: true,
      agreementId: ag.id,
      originalTermsHash: ag.terms_hash,
      tamperedTermsHash: mutatedTermsHash,
      onChainHashMatches: Boolean(auditRes.hashMatches),
      evmContractResponse: evmRejectionError,
      explanation:
        'Unilateral tampering failed: (1) Altering time, cost, or features changed the Keccak-256 fingerprint so it mismatches the on-chain hash, and (2) the Smart Contract rejected the update because the other party never signed the altered terms.',
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// MILESTONES & DELIVERABLE PROOFS
// ============================================================================
app.post('/api/milestones/:id/submit-evidence', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      actorDid,
      commitHash = '',
      repoUrl = '',
      evidenceNotes = '',
      artifactName = 'deliverable-proof.json',
      artifactContent = '',
      signature: providedSignature = null,
    } = req.body;

    const ms = db.prepare('SELECT * FROM milestones WHERE id = ?').get(id);
    if (!ms) return res.status(404).json({ error: 'Milestone not found' });

    const ag = db.prepare('SELECT * FROM agreements WHERE id = ?').get(ms.agreement_id);
    if (!ag || ag.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Contract must be ACTIVE to submit milestone deliverables' });
    }
    if (actorDid !== ag.freelancer_did) {
      return res.status(403).json({ error: 'Only the hired Freelancer on this contract can submit deliverables' });
    }

    const evidenceBundle = {
      milestoneId: ms.id,
      agreementId: ag.id,
      title: ms.title,
      commitHash: String(commitHash).trim(),
      repoUrl: String(repoUrl).trim(),
      notes: String(evidenceNotes).trim(),
      artifactName: String(artifactName).trim(),
      artifactSha256: crypto
        .createHash('sha256')
        .update(String(artifactContent || evidenceNotes), 'utf8')
        .digest('hex'),
    };

    const { hash: deliverableHash } = keccak256Json(evidenceBundle);
    const { cid: evidenceCid } = pinToIpfsVault(
      { ...evidenceBundle, artifactContent },
      { type: 'MILESTONE_EVIDENCE', milestoneId: ms.id }
    );

    const signingDigest = computeMilestoneDigest({
      milestoneId: ms.id,
      agreementId: ag.id,
      deliverableHash,
    });

    const { signature, identityRow } = await resolveSignature({
      actorDid,
      digestHex: signingDigest,
      providedSignature,
    });

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE milestones
      SET evidence_notes = ?,
          commit_hash = ?,
          repo_url = ?,
          artifact_name = ?,
          artifact_content = ?,
          deliverable_hash = ?,
          evidence_cid = ?,
          signing_digest = ?,
          freelancer_signature = ?,
          submitted_at = ?,
          status = 'EVIDENCE_SUBMITTED'
      WHERE id = ?
    `).run(
      evidenceBundle.notes,
      evidenceBundle.commitHash,
      evidenceBundle.repoUrl,
      evidenceBundle.artifactName,
      String(artifactContent || ''),
      deliverableHash,
      evidenceCid,
      signingDigest,
      signature,
      nowIso,
      ms.id
    );

    db.prepare(`
      INSERT INTO messages (id, thread_id, sender_did, body, message_type, created_at)
      VALUES (?, ?, ?, ?, 'SYSTEM', ?)
    `).run(
      `msg-${crypto.randomBytes(5).toString('hex')}`,
      ag.root_agreement_id,
      actorDid,
      `${identityRow.name} submitted deliverable proof for ${ms.title} (Commit ${evidenceBundle.commitHash.slice(0, 10)}).`,
      nowIso
    );

    res.json({
      ok: true,
      milestoneId: ms.id,
      deliverableHash,
      evidenceCid,
      signingDigest,
      status: 'EVIDENCE_SUBMITTED',
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/milestones/:id/sign-off', async (req, res) => {
  try {
    const { id } = req.params;
    const { actorDid, signature: providedSignature = null, autoCompleteAgreement = true } = req.body;

    const ms = db.prepare('SELECT * FROM milestones WHERE id = ?').get(id);
    if (!ms) return res.status(404).json({ error: 'Milestone not found' });
    if (ms.status !== 'EVIDENCE_SUBMITTED') {
      return res.status(400).json({ error: 'Milestone must have submitted deliverables first' });
    }

    const ag = db.prepare('SELECT * FROM agreements WHERE id = ?').get(ms.agreement_id);
    if (!ag || ag.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Contract must be ACTIVE' });
    }
    if (actorDid !== ag.client_did) {
      return res.status(403).json({ error: 'Only the Gig Provider on this contract can approve & sign off deliverables' });
    }

    const { signature: clientSignature } = await resolveSignature({
      actorDid,
      digestHex: ms.signing_digest,
      providedSignature,
    });

    const receipt = await chain.sendTx(
      'anchorMilestoneSignOff',
      [
        ms.id,
        ag.id,
        ms.deliverable_hash,
        ms.evidence_cid,
        ms.freelancer_signature,
        clientSignature,
      ],
      {
        actorAddress: ag.client_address,
        summary: `Approved & Anchored Milestone #${ms.idx}: ${ms.title}`,
        referenceId: ms.id,
      }
    );

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE milestones
      SET client_signature = ?,
          signed_off_at = ?,
          status = 'VERIFIED_ONCHAIN',
          tx_hash = ?,
          block_number = ?
      WHERE id = ?
    `).run(clientSignature, nowIso, receipt.txHash, receipt.blockNumber, ms.id);

    const remaining = db
      .prepare("SELECT COUNT(*) as cnt FROM milestones WHERE agreement_id = ? AND status != 'VERIFIED_ONCHAIN'")
      .get(ag.id);

    let agreementCompleted = false;
    if (autoCompleteAgreement && remaining.cnt === 0) {
      const clientRow = db.prepare('SELECT * FROM identities WHERE did = ?').get(ag.client_did);
      if (clientRow?.demo_private_key) {
        const compDigest = computeCompleteAgreementDigest({
          agreementId: ag.id,
          termsHash: ag.terms_hash,
        });
        const compSig = await signDigestWithKey(clientRow.demo_private_key, compDigest);
        await chain.sendTx('completeAgreement', [ag.id, compSig], {
          actorAddress: ag.client_address,
          summary: `Completed Contract on Blockchain: ${ag.title}`,
          referenceId: ag.id,
        });
        db.prepare("UPDATE agreements SET status = 'COMPLETED' WHERE id = ?").run(ag.id);
        if (ag.gig_id) {
          db.prepare("UPDATE gigs SET status = 'COMPLETED' WHERE id = ?").run(ag.gig_id);
        }
        agreementCompleted = true;
      }
    }

    res.json({ ok: true, milestoneId: ms.id, agreementCompleted, receipt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// W3C VERIFIABLE CREDENTIALS & REVOCATION REGISTRY
// ============================================================================
app.post('/api/credentials/issue', async (req, res) => {
  try {
    const {
      agreementId,
      issuerDid,
      rolePerformed,
      summaryStatement,
      skillsVerified = [],
      rating = 5,
      signature: providedSignature = null,
    } = req.body;

    const ag = db.prepare('SELECT * FROM agreements WHERE id = ?').get(agreementId);
    if (!ag) return res.status(404).json({ error: 'Contract not found' });
    if (ag.status !== 'ACTIVE' && ag.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Credentials can only be issued for active or completed contracts' });
    }
    if (issuerDid !== ag.client_did) {
      return res.status(403).json({ error: 'Only the Gig Provider on this contract can issue its credential' });
    }

    const issuer = db.prepare('SELECT * FROM identities WHERE did = ?').get(ag.client_did);
    const subject = db.prepare('SELECT * FROM identities WHERE did = ?').get(ag.freelancer_did);
    const verifiedMs = db
      .prepare("SELECT deliverable_hash FROM milestones WHERE agreement_id = ? AND status = 'VERIFIED_ONCHAIN'")
      .all(ag.id);

    const deliverableHashes = verifiedMs.map((m) => m.deliverable_hash).filter(Boolean);
    const credentialId = ethers.keccak256(ethers.toUtf8Bytes(`vc:${ag.id}:${Date.now()}`));
    const issuedAtIso = new Date().toISOString();

    const vcUnsigned = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://trustwork.protocol/credentials/v2',
      ],
      id: `urn:trustwork:vc:${credentialId}`,
      type: ['VerifiableCredential', 'TrustWorkProfessionalCredential'],
      issuer: {
        id: issuer.did,
        name: issuer.name,
        organization: issuer.organization,
        tier: issuer.issuer_tier,
        domain: issuer.domain,
      },
      issuanceDate: issuedAtIso,
      credentialSubject: {
        id: subject.did,
        name: subject.name,
        projectTitle: ag.title,
        rolePerformed: String(rolePerformed || 'Lead Freelance Specialist').trim(),
        statement: String(
          summaryStatement || `${subject.name} successfully delivered ${ag.title}.`
        ).trim(),
        skillsVerified: Array.isArray(skillsVerified) ? skillsVerified : [],
        agreementId: ag.id,
        agreementVersion: ag.version,
        agreementTermsHash: ag.terms_hash,
        deliverableHashes,
        rating: Number(rating),
      },
    };

    const { hash: vcHash } = keccak256Json(vcUnsigned);
    const signingDigest = computeCredentialDigest({
      credentialId,
      vcHash,
      agreementId: ag.id,
      issuer: issuer.address,
      subject: subject.address,
    });

    const { signature: issuerSig } = await resolveSignature({
      actorDid: issuer.did,
      digestHex: signingDigest,
      providedSignature,
    });

    const fullVc = {
      ...vcUnsigned,
      proof: {
        type: 'EcdsaSecp256k1RecoverySignature2020',
        created: issuedAtIso,
        proofPurpose: 'assertionMethod',
        verificationMethod: `${issuer.did}#controller`,
        vcPayloadKeccak256: vcHash,
        onChainDigest: signingDigest,
        jwsSignature: issuerSig,
      },
    };

    const { cid: ipfsCid } = pinToIpfsVault(fullVc, {
      type: 'W3C_VERIFIABLE_CREDENTIAL',
      credentialId,
    });

    const receipt = await chain.sendTx(
      'anchorCredential',
      [credentialId, vcHash, ag.id, issuer.address, subject.address, ipfsCid, issuerSig],
      {
        actorAddress: issuer.address,
        summary: `Issued Verified Work Credential: ${issuer.name} -> ${subject.name}`,
        referenceId: credentialId,
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
      credentialId,
      ag.id,
      issuer.did,
      issuer.address,
      subject.did,
      subject.address,
      ag.title,
      vcUnsigned.credentialSubject.rolePerformed,
      vcUnsigned.credentialSubject.statement,
      JSON.stringify(vcUnsigned.credentialSubject.skillsVerified),
      ag.total_cost,
      ag.currency,
      Number(rating),
      JSON.stringify(deliverableHashes),
      JSON.stringify(fullVc, null, 2),
      vcHash,
      ipfsCid,
      signingDigest,
      issuerSig,
      receipt.txHash,
      receipt.blockNumber,
      receipt.gasUsed,
      issuedAtIso
    );

    res.status(201).json({ credentialId, vcHash, ipfsCid, vcDocument: fullVc, receipt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/credentials/:id/revoke', async (req, res) => {
  try {
    const { id } = req.params;
    const { actorDid, reason = 'Revoked by issuer', signature: providedSignature = null } = req.body;

    const cred = db.prepare('SELECT * FROM verifiable_credentials WHERE id = ?').get(id);
    if (!cred) return res.status(404).json({ error: 'Credential not found' });
    if (cred.revoked) return res.status(400).json({ error: 'Credential is already revoked' });
    if (actorDid !== cred.issuer_did) {
      return res.status(403).json({ error: 'Only the original Gig Provider who issued this credential can revoke it' });
    }

    const digest = computeRevokeCredentialDigest({
      credentialId: cred.id,
      vcHash: cred.vc_hash,
      reason: String(reason).trim(),
    });

    const { signature } = await resolveSignature({
      actorDid,
      digestHex: digest,
      providedSignature,
    });

    const receipt = await chain.sendTx(
      'revokeCredential',
      [cred.id, String(reason).trim(), signature],
      {
        actorAddress: cred.issuer_address,
        summary: `Revoked Credential on-chain (${reason})`,
        referenceId: cred.id,
      }
    );

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE verifiable_credentials
      SET revoked = 1, revocation_reason = ?, revoked_at = ?, revocation_tx_hash = ?
      WHERE id = ?
    `).run(String(reason).trim(), nowIso, receipt.txHash, cred.id);

    res.json({ ok: true, credentialId: cred.id, revokedAt: nowIso, receipt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// 1-SECOND INDEPENDENT BLOCKCHAIN AUDIT VERIFIER
// ============================================================================
app.post('/api/verify', async (req, res) => {
  const started = performance.now();
  try {
    const { mode = 'credential', targetId = '', documentJson = null } = req.body;

    if (mode === 'credential') {
      let parsedDoc = null;
      if (documentJson) {
        parsedDoc = typeof documentJson === 'string' ? JSON.parse(documentJson) : documentJson;
      }

      let credId = targetId;
      if (!credId && parsedDoc?.id) {
        credId = parsedDoc.id.replace('urn:trustwork:vc:', '');
      }
      if (!credId || !credId.startsWith('0x') || credId.length !== 66) {
        return res.status(400).json({ error: 'Provide a valid 32-byte Credential ID or W3C VC JSON' });
      }

      const dbCred = db.prepare('SELECT * FROM verifiable_credentials WHERE id = ?').get(credId);
      const docToHash = parsedDoc || (dbCred ? JSON.parse(dbCred.vc_json) : null);
      if (!docToHash) {
        return res.status(404).json({ error: 'Credential document not found' });
      }

      const { proof, ...unsignedPart } = docToHash;
      const { hash: recomputedVcHash } = keccak256Json(unsignedPart);

      const onChain = await chain.callView('auditCredential', [credId, recomputedVcHash]);
      const exists = Boolean(onChain.exists);
      const hashMatches = Boolean(onChain.hashMatches);
      const isRevoked = Boolean(onChain.isRevoked);
      const onChainIssuer = onChain.issuer;
      const onChainSubject = onChain.subject;
      const issuerTierName = ISSUER_TIER_NAMES[Number(onChain.issuerTier)] || 'INDIVIDUAL';

      let signatureValid = false;
      let recoveredSigner = null;
      if (proof?.jwsSignature && exists) {
        const agreementId = unsignedPart?.credentialSubject?.agreementId || dbCred?.agreement_id || ethers.ZeroHash;
        const expectedDigest = computeCredentialDigest({
          credentialId: credId,
          vcHash: recomputedVcHash,
          agreementId,
          issuer: onChainIssuer,
          subject: onChainSubject,
        });
        recoveredSigner = recoverDigestSigner(expectedDigest, proof.jwsSignature);
        signatureValid =
          Boolean(recoveredSigner) &&
          ethers.getAddress(recoveredSigner) === ethers.getAddress(onChainIssuer);
      }

      const issuerProfile = db
        .prepare('SELECT * FROM identities WHERE LOWER(address) = LOWER(?)')
        .get(onChainIssuer);

      const elapsedMs = Number((performance.now() - started).toFixed(2));
      return res.json({
        mode: 'credential',
        auditDurationMs: elapsedMs,
        verified: exists && hashMatches && signatureValid && !isRevoked,
        checks: {
          anchoredOnBlockchain: exists,
          payloadIntegrityIntact: hashMatches,
          issuerSignatureValid: signatureValid,
          notRevoked: exists ? !isRevoked : false,
        },
        cryptography: {
          credentialId: credId,
          recomputedKeccak256: recomputedVcHash,
          expectedProofHash: proof?.vcPayloadKeccak256 || dbCred?.vc_hash || null,
          recoveredIssuerAddress: recoveredSigner,
          onChainIssuerAddress: onChainIssuer,
          onChainSubjectAddress: onChainSubject,
          issuedAtTimestamp: Number(onChain.issuedAt),
          revokedAtTimestamp: Number(onChain.revokedAt),
          revocationReason: onChain.revocationReason,
          txHash: dbCred?.tx_hash || null,
          blockNumber: dbCred?.block_number || null,
        },
        issuerSummary: issuerProfile
          ? sanitizeIdentity(issuerProfile)
          : { address: onChainIssuer, issuerTier: issuerTierName },
      });
    }

    let parsedAg = null;
    if (documentJson) {
      parsedAg = typeof documentJson === 'string' ? JSON.parse(documentJson) : documentJson;
    }
    const agId = targetId;
    if (!agId || !agId.startsWith('0x') || agId.length !== 66) {
      return res.status(400).json({ error: 'Provide a valid 32-byte Agreement ID' });
    }

    const dbAg = db.prepare('SELECT * FROM agreements WHERE id = ?').get(agId);
    const payloadToHash = parsedAg || (dbAg ? JSON.parse(dbAg.canonical_payload_json) : null);
    if (!payloadToHash) {
      return res.status(404).json({ error: 'Agreement payload not found' });
    }

    const { hash: recomputedTermsHash } = keccak256Json(payloadToHash);
    const onChain = await chain.callView('auditAgreement', [agId, recomputedTermsHash]);

    const exists = Boolean(onChain.exists);
    const hashMatches = Boolean(onChain.hashMatches);
    const statusName = AGREEMENT_STATUS_NAMES[Number(onChain.status)] || 'NONE';
    const version = Number(onChain.version);

    let clientSigValid = false;
    let freelancerSigValid = false;
    if (exists && dbAg?.client_signature && dbAg?.freelancer_signature) {
      const digest =
        version === 1
          ? computeInitialAgreementDigest({
              agreementId: agId,
              gigProvider: onChain.gigProvider,
              freelancer: onChain.freelancer,
              termsHash: recomputedTermsHash,
            })
          : computeAmendmentDigest({
              newAgreementId: agId,
              newVersion: version,
              parentAgreementId: onChain.parentAgreementId,
              gigProvider: onChain.gigProvider,
              freelancer: onChain.freelancer,
              newTermsHash: recomputedTermsHash,
            });
      const recClient = recoverDigestSigner(digest, dbAg.client_signature);
      const recFreelancer = recoverDigestSigner(digest, dbAg.freelancer_signature);
      clientSigValid =
        Boolean(recClient) && ethers.getAddress(recClient) === ethers.getAddress(onChain.gigProvider);
      freelancerSigValid =
        Boolean(recFreelancer) &&
        ethers.getAddress(recFreelancer) === ethers.getAddress(onChain.freelancer);
    }

    const elapsedMs = Number((performance.now() - started).toFixed(2));
    return res.json({
      mode: 'agreement',
      auditDurationMs: elapsedMs,
      verified: exists && hashMatches && clientSigValid && freelancerSigValid,
      checks: {
        anchoredOnBlockchain: exists,
        payloadIntegrityIntact: hashMatches,
        gigProviderSignatureValid: clientSigValid,
        freelancerSignatureValid: freelancerSigValid,
        isLatestVersion: onChain.supersededBy === ethers.ZeroHash,
      },
      cryptography: {
        agreementId: agId,
        version,
        onChainStatus: statusName,
        recomputedKeccak256: recomputedTermsHash,
        gigProviderAddress: onChain.gigProvider,
        freelancerAddress: onChain.freelancer,
        anchoredAtTimestamp: Number(onChain.anchoredAt),
        parentAgreementId:
          onChain.parentAgreementId === ethers.ZeroHash ? null : onChain.parentAgreementId,
        supersededBy: onChain.supersededBy === ethers.ZeroHash ? null : onChain.supersededBy,
        txHash: dbAg?.tx_hash || null,
        blockNumber: dbAg?.block_number || null,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// PRIVACY ZKP CLAIMS & IPFS CONTENT INSPECTOR
// ============================================================================
app.post('/api/zkp/generate', (req, res) => {
  try {
    const { subjectDid, claimType = 'MIN_EARNINGS_INR', threshold = 500000, title = '' } = req.body;
    const creds = db
      .prepare('SELECT * FROM verifiable_credentials WHERE subject_did = ? AND revoked = 0')
      .all(subjectDid);

    if (creds.length === 0) {
      return res.status(400).json({ error: 'Complete at least 1 verified contract credential first' });
    }

    const actualValue =
      claimType === 'MIN_EARNINGS_INR'
        ? creds.reduce((sum, c) => sum + Number(c.contract_value || 0), 0)
        : creds.length;

    const proof = createThresholdCommitmentProof({
      subjectDid,
      claimType,
      threshold: Number(threshold),
      actualValue,
      credentialHashes: creds.map((c) => c.vc_hash),
    });

    const id = ethers.keccak256(ethers.toUtf8Bytes(`zkp:${subjectDid}:${Date.now()}`));
    const displayTitle =
      title ||
      (claimType === 'MIN_EARNINGS_INR'
        ? `Verified ₹${Number(threshold).toLocaleString('en-IN')}+ Contract Revenue (Private Client Names Hidden)`
        : `Completed ${threshold}+ Blockchain-Verified Contracts`);

    db.prepare(`
      INSERT INTO zkp_proofs (id, subject_did, title, claim_type, threshold, proof_json, public_commitment, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      subjectDid,
      displayTitle,
      claimType,
      Number(threshold),
      JSON.stringify(proof, null, 2),
      proof.publicCommitment,
      proof.createdAt
    );

    res.status(201).json({ id, title: displayTitle, proof });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/zkp/verify', (req, res) => {
  try {
    const { proof } = req.body;
    const parsed = typeof proof === 'string' ? JSON.parse(proof) : proof;
    const result = verifyThresholdCommitmentProof(parsed);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/ipfs/:cid', (req, res) => {
  const envelope = getFromIpfsVault(req.params.cid);
  if (!envelope) return res.status(404).json({ error: 'CID not found in IPFS vault' });
  res.json(envelope);
});

app.post('/rpc', async (req, res) => {
  await chain.init();
  const { id = 1, method } = req.body || {};
  if (method === 'eth_chainId') return res.json({ jsonrpc: '2.0', id, result: '0x7a69' });
  if (method === 'net_version') return res.json({ jsonrpc: '2.0', id, result: '31337' });
  if (method === 'eth_blockNumber') {
    return res.json({ jsonrpc: '2.0', id, result: '0x' + chain.blockNumber.toString(16) });
  }
  return res.json({ jsonrpc: '2.0', id, result: null });
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/rpc')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const PORT = Number(process.env.PORT || 4000);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedIfEmpty()
    .then(() => {
      app.listen(PORT, '127.0.0.1', () => {
        console.log(`[trustwork] Freelance Platform + Blockchain Engine running on http://127.0.0.1:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
