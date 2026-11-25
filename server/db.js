import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'trustwork.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS identities (
    did TEXT PRIMARY KEY,
    address TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    headline TEXT NOT NULL DEFAULT '',
    email TEXT UNIQUE NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    bio TEXT DEFAULT '',
    hourly_rate REAL NOT NULL DEFAULT 2500,
    location TEXT NOT NULL DEFAULT 'Remote',
    organization TEXT DEFAULT '',
    domain TEXT DEFAULT '',
    issuer_tier TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    kyb_verified INTEGER NOT NULL DEFAULT 0,
    skills_json TEXT NOT NULL DEFAULT '[]',
    avatar_color TEXT NOT NULL DEFAULT '#18181B',
    signing_private_key TEXT DEFAULT NULL,
    tx_hash TEXT DEFAULT NULL,
    block_number INTEGER DEFAULT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_did TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_did) REFERENCES identities(did) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS gigs (
    id TEXT PRIMARY KEY,
    poster_did TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Software Development',
    budget_min REAL NOT NULL,
    budget_max REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    duration_days INTEGER NOT NULL DEFAULT 21,
    deadline TEXT NOT NULL,
    experience_level TEXT NOT NULL DEFAULT 'Mid-Senior',
    skills_json TEXT NOT NULL DEFAULT '[]',
    features_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'OPEN',
    hired_freelancer_did TEXT DEFAULT NULL,
    root_agreement_id TEXT DEFAULT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    gig_id TEXT NOT NULL,
    freelancer_did TEXT NOT NULL,
    cover_letter TEXT NOT NULL,
    proposed_cost REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    proposed_duration_days INTEGER NOT NULL,
    proposed_deadline TEXT NOT NULL,
    proposed_features_json TEXT NOT NULL DEFAULT '[]',
    proposed_milestones_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'PENDING',
    agreement_id TEXT DEFAULT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    sender_did TEXT NOT NULL,
    body TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'TEXT',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agreements (
    id TEXT PRIMARY KEY,
    gig_id TEXT DEFAULT NULL,
    root_agreement_id TEXT NOT NULL,
    parent_agreement_id TEXT DEFAULT NULL,
    superseded_by_id TEXT DEFAULT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Software Development',
    client_did TEXT NOT NULL,
    client_address TEXT NOT NULL,
    freelancer_did TEXT NOT NULL,
    freelancer_address TEXT NOT NULL,
    proposed_by_did TEXT NOT NULL,
    start_date TEXT NOT NULL,
    deadline TEXT NOT NULL,
    duration_days INTEGER NOT NULL DEFAULT 30,
    total_cost REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    payment_schedule TEXT NOT NULL DEFAULT 'Milestone-Based',
    features_json TEXT NOT NULL DEFAULT '[]',
    milestones_spec_json TEXT NOT NULL DEFAULT '[]',
    clauses_json TEXT NOT NULL DEFAULT '{}',
    amendment_reason TEXT DEFAULT '',
    canonical_payload_json TEXT NOT NULL,
    terms_hash TEXT NOT NULL,
    signing_digest TEXT NOT NULL,
    ipfs_cid TEXT NOT NULL,
    client_signature TEXT DEFAULT NULL,
    client_signed_at TEXT DEFAULT NULL,
    freelancer_signature TEXT DEFAULT NULL,
    freelancer_signed_at TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_SIGNATURES',
    rejection_reason TEXT DEFAULT NULL,
    tx_hash TEXT DEFAULT NULL,
    block_number INTEGER DEFAULT NULL,
    gas_used INTEGER DEFAULT NULL,
    anchored_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    agreement_id TEXT NOT NULL,
    root_agreement_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    title TEXT NOT NULL,
    deliverables TEXT NOT NULL,
    due_date TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    evidence_notes TEXT DEFAULT '',
    commit_hash TEXT DEFAULT '',
    repo_url TEXT DEFAULT '',
    artifact_name TEXT DEFAULT '',
    artifact_content TEXT DEFAULT '',
    deliverable_hash TEXT DEFAULT NULL,
    evidence_cid TEXT DEFAULT NULL,
    signing_digest TEXT DEFAULT NULL,
    freelancer_signature TEXT DEFAULT NULL,
    submitted_at TEXT DEFAULT NULL,
    client_signature TEXT DEFAULT NULL,
    signed_off_at TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    tx_hash TEXT DEFAULT NULL,
    block_number INTEGER DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS verifiable_credentials (
    id TEXT PRIMARY KEY,
    agreement_id TEXT NOT NULL,
    issuer_did TEXT NOT NULL,
    issuer_address TEXT NOT NULL,
    subject_did TEXT NOT NULL,
    subject_address TEXT NOT NULL,
    project_title TEXT NOT NULL,
    role_performed TEXT NOT NULL,
    summary_statement TEXT NOT NULL,
    skills_verified_json TEXT NOT NULL DEFAULT '[]',
    contract_value REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    rating INTEGER NOT NULL DEFAULT 5,
    deliverable_hashes_json TEXT NOT NULL DEFAULT '[]',
    vc_json TEXT NOT NULL,
    vc_hash TEXT NOT NULL,
    ipfs_cid TEXT NOT NULL,
    signing_digest TEXT NOT NULL,
    issuer_signature TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    revocation_reason TEXT DEFAULT '',
    revoked_at TEXT DEFAULT NULL,
    revocation_tx_hash TEXT DEFAULT NULL,
    tx_hash TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    gas_used INTEGER DEFAULT NULL,
    issued_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS zkp_proofs (
    id TEXT PRIMARY KEY,
    subject_did TEXT NOT NULL,
    title TEXT NOT NULL,
    claim_type TEXT NOT NULL,
    threshold REAL NOT NULL,
    proof_json TEXT NOT NULL,
    public_commitment TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chain_transactions (
    tx_hash TEXT PRIMARY KEY,
    block_number INTEGER NOT NULL,
    method TEXT NOT NULL,
    actor_address TEXT NOT NULL,
    contract_address TEXT NOT NULL,
    gas_used INTEGER NOT NULL,
    summary TEXT NOT NULL,
    reference_id TEXT DEFAULT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS evm_journal (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    method TEXT NOT NULL,
    args_json TEXT NOT NULL,
    timestamp_sec INTEGER NOT NULL,
    tx_hash TEXT NOT NULL,
    block_number INTEGER NOT NULL
  );
`);
