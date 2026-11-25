# TRUSTWORK — Decentralized Professional Reputation & Dual-Signed Digital Agreement Platform

> **"Verify the work. Trust the professional."**  
> Consensus 2026 // DLT-REP-v2.0 — W3C DIDs + Verifiable Credentials + EVM Smart Contracts

## Key Capabilities Implemented

1. **Dual-Signed Tamper-Proof Blockchain Digital Agreements (`TrustWorkProtocol.sol`)**
   - Freelancer and Gig Provider define **timeline** (start date, deadline, duration), **cost & payment schedule**, **structured features & acceptance criteria**, and **milestones**.
   - Canonical JSON payload is pinned to the off-chain IPFS Content-Addressed Vault (`bafkrei...`) and hashed via **Keccak-256**.
   - **Dual-Signature Enforcement**: `anchorAgreement()` on-chain verifies **both** ECDSA secp256k1 signatures via `ecrecover`. Neither party can anchor or alter an agreement unilaterally.
2. **Mutual Modification & Versioned Agreement Lineage (`v1 ➔ v2 ➔ v3`)**
   - If scope, timeline, cost, or features need to change, either party can **Propose a Mutual Amendment**.
   - While awaiting counterparty approval, the existing agreement remains **100% ACTIVE and untouched** on-chain.
   - Only when **both parties cryptographically sign** the amended specification does `amendAgreement()` mark `v1` as `SUPERSEDED` and anchor a brand-new linked **Agreement `v2`** on-chain, preserving a full side-by-side diff and audit history.
   - Includes a live **Unilateral Tamper Attack Simulator** proving single-party edits fail both Keccak-256 hash checks and EVM `ecrecover` checks.
3. **Full TrustWork Presentation Architecture (Slides 01–12)**
   - **Self-Controlled W3C DIDs** (`did:trustwork:0x...`) with local cryptographic persona switcher + MetaMask browser wallet support.
   - **Evidence-Backed Milestones**: Git commit hashes + IPFS artifact manifests + dual freelancer/client cryptographic sign-off.
   - **W3C Verifiable Credentials (JSON-LD)**: Exportable `.vc.json` certificates, **On-Chain Revocation Registry**, and **Mobile Wallet QR Code** presentation.
   - **1-Second Independent Audit Verifier**: Instant `<5ms` EVM static-call audit with interactive single-character tamper testing.
   - **Multi-Tier Verified Issuer Registry** (`ENTERPRISE`, `VERIFIED_ORG`, `INDIVIDUAL`), **TrustWork Evidence Score**, **ZKP Selective Disclosure Proofs**, and **Graph Anti-Collusion Diagnostics**.

## Quick Start

```bash
# Start both the Express + Embedded EVM Blockchain server (port 4000) and Vite React UI (port 5173)
npm run dev
```

Or build and serve from a single port:

```bash
npm run build
npm start
```

Run the end-to-end smart contract & API verification suite:

```bash
npm test
```
