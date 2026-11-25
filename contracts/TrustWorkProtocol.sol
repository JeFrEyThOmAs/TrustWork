// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title TrustWorkProtocol
 * @notice Decentralized Professional Reputation, W3C Verifiable Credential Registry,
 *         and Dual-Signed Tamper-Proof Digital Agreement & Mutual Amendment Engine.
 * @dev Implements Slide 04-10 of TrustWork Architecture + Dual-Party Agreement Versioning.
 *      Only 32-byte Keccak-256 fingerprints, DIDs, ECDSA proofs, and revocation states
 *      are stored on-chain (Smart Data Separation).
 */
contract TrustWorkProtocol {
    enum IssuerTier {
        INDIVIDUAL,
        VERIFIED_ORG,
        ENTERPRISE,
        PLATFORM
    }

    enum AgreementStatus {
        NONE,
        ACTIVE,
        SUPERSEDED,
        COMPLETED,
        TERMINATED
    }

    struct Identity {
        address controller;
        string did;
        IssuerTier tier;
        bool active;
        uint64 registeredAt;
        bytes32 profileHash;
    }

    struct AgreementRecord {
        bytes32 agreementId;
        bytes32 rootAgreementId;
        bytes32 parentAgreementId;
        bytes32 supersededBy;
        uint32 version;
        address gigProvider;
        address freelancer;
        bytes32 termsHash;
        string ipfsCid;
        bytes32 gigProviderSigHash;
        bytes32 freelancerSigHash;
        uint64 anchoredAt;
        AgreementStatus status;
    }

    struct MilestoneAnchor {
        bytes32 milestoneId;
        bytes32 agreementId;
        bytes32 deliverableHash;
        string evidenceCid;
        address freelancer;
        address gigProvider;
        uint64 signedOffAt;
        bool verified;
    }

    struct CredentialRecord {
        bytes32 credentialId;
        bytes32 vcHash;
        bytes32 agreementId;
        address issuer;
        address subject;
        string ipfsCid;
        uint64 issuedAt;
        bool revoked;
        uint64 revokedAt;
        string revocationReason;
    }

    address public registrar;

    mapping(address => Identity) public identities;
    address[] public identityList;

    mapping(bytes32 => AgreementRecord) public agreements;
    mapping(bytes32 => bytes32[]) private agreementLineages;
    bytes32[] public allAgreementIds;

    mapping(bytes32 => MilestoneAnchor) public milestones;
    mapping(bytes32 => bytes32[]) private agreementMilestones;

    mapping(bytes32 => CredentialRecord) public credentials;
    bytes32[] public allCredentialIds;

    event IdentityRegistered(address indexed controller, string did, IssuerTier tier, uint64 timestamp);
    event IssuerTierUpdated(address indexed controller, IssuerTier newTier);

    event AgreementAnchored(
        bytes32 indexed agreementId,
        bytes32 indexed rootAgreementId,
        uint32 version,
        address indexed gigProvider,
        address freelancer,
        bytes32 termsHash,
        string ipfsCid
    );

    event AgreementAmended(
        bytes32 indexed parentAgreementId,
        bytes32 indexed newAgreementId,
        bytes32 indexed rootAgreementId,
        uint32 newVersion,
        bytes32 newTermsHash
    );

    event AgreementCompleted(bytes32 indexed agreementId, uint64 timestamp);

    event MilestoneSignedOff(
        bytes32 indexed milestoneId,
        bytes32 indexed agreementId,
        bytes32 deliverableHash,
        address freelancer,
        address gigProvider
    );

    event CredentialAnchored(
        bytes32 indexed credentialId,
        bytes32 indexed agreementId,
        address indexed issuer,
        address subject,
        bytes32 vcHash
    );

    event CredentialRevoked(bytes32 indexed credentialId, address indexed issuer, string reason, uint64 timestamp);

    error InvalidParties();
    error AgreementAlreadyExists();
    error ParentAgreementNotActive();
    error InvalidGigProviderSignature();
    error InvalidFreelancerSignature();
    error InvalidIssuerSignature();
    error CredentialAlreadyExists();
    error CredentialNotFound();
    error CredentialAlreadyRevoked();
    error UnauthorizedRegistrar();

    constructor() {
        registrar = msg.sender;
    }

    // =========================================================================
    // 1. SELF-CONTROLLED DID & MULTI-TIER ISSUER REGISTRY
    // =========================================================================

    function registerIdentity(
        address controller,
        string calldata did,
        IssuerTier tier,
        bytes32 profileHash
    ) external {
        require(controller != address(0), "Zero controller");
        bool isNew = !identities[controller].active;
        identities[controller] = Identity({
            controller: controller,
            did: did,
            tier: tier,
            active: true,
            registeredAt: isNew ? uint64(block.timestamp) : identities[controller].registeredAt,
            profileHash: profileHash
        });
        if (isNew) {
            identityList.push(controller);
        }
        emit IdentityRegistered(controller, did, tier, uint64(block.timestamp));
    }

    function updateIssuerTier(address controller, IssuerTier newTier) external {
        if (msg.sender != registrar) revert UnauthorizedRegistrar();
        require(identities[controller].active, "Identity not registered");
        identities[controller].tier = newTier;
        emit IssuerTierUpdated(controller, newTier);
    }

    // =========================================================================
    // 2. DUAL-PARTY DIGITAL AGREEMENT & MUTUAL AMENDMENT ENGINE
    // =========================================================================

    /**
     * @notice Computes the deterministic digest that BOTH gigProvider and freelancer must sign
     *         to anchor an initial Agreement (Version 1).
     */
    function computeInitialAgreementDigest(
        bytes32 agreementId,
        address gigProvider,
        address freelancer,
        bytes32 termsHash
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "TRUSTWORK_AGREEMENT_V1",
                agreementId,
                uint32(1),
                bytes32(0),
                gigProvider,
                freelancer,
                termsHash
            )
        );
    }

    /**
     * @notice Computes the deterministic digest that BOTH parties of an existing ACTIVE agreement
     *         must sign to create a mutually agreed Amendment (Version N+1).
     */
    function computeAmendmentDigest(
        bytes32 newAgreementId,
        uint32 newVersion,
        bytes32 parentAgreementId,
        address gigProvider,
        address freelancer,
        bytes32 newTermsHash
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "TRUSTWORK_AMENDMENT_V1",
                newAgreementId,
                newVersion,
                parentAgreementId,
                gigProvider,
                freelancer,
                newTermsHash
            )
        );
    }

    /**
     * @notice Anchors a Version 1 Digital Agreement on-chain.
     *         Reverts unless BOTH gigProvider and freelancer have signed the exact same termsHash.
     */
    function anchorAgreement(
        bytes32 agreementId,
        address gigProvider,
        address freelancer,
        bytes32 termsHash,
        string calldata ipfsCid,
        bytes calldata gigProviderSig,
        bytes calldata freelancerSig
    ) external {
        if (gigProvider == address(0) || freelancer == address(0) || gigProvider == freelancer) {
            revert InvalidParties();
        }
        if (agreements[agreementId].status != AgreementStatus.NONE) {
            revert AgreementAlreadyExists();
        }

        bytes32 digest = computeInitialAgreementDigest(agreementId, gigProvider, freelancer, termsHash);

        if (_recoverEthSigned(digest, gigProviderSig) != gigProvider) {
            revert InvalidGigProviderSignature();
        }
        if (_recoverEthSigned(digest, freelancerSig) != freelancer) {
            revert InvalidFreelancerSignature();
        }

        agreements[agreementId] = AgreementRecord({
            agreementId: agreementId,
            rootAgreementId: agreementId,
            parentAgreementId: bytes32(0),
            supersededBy: bytes32(0),
            version: 1,
            gigProvider: gigProvider,
            freelancer: freelancer,
            termsHash: termsHash,
            ipfsCid: ipfsCid,
            gigProviderSigHash: keccak256(gigProviderSig),
            freelancerSigHash: keccak256(freelancerSig),
            anchoredAt: uint64(block.timestamp),
            status: AgreementStatus.ACTIVE
        });

        agreementLineages[agreementId].push(agreementId);
        allAgreementIds.push(agreementId);

        emit AgreementAnchored(agreementId, agreementId, 1, gigProvider, freelancer, termsHash, ipfsCid);
    }

    /**
     * @notice Mutually modifies an ACTIVE agreement by minting a new Agreement version on-chain
     *         and marking the previous version SUPERSEDED.
     *         Unilateral modification is mathematically impossible: BOTH original parties must
     *         cryptographically sign the exact newTermsHash and parentAgreementId.
     */
    function amendAgreement(
        bytes32 parentAgreementId,
        bytes32 newAgreementId,
        bytes32 newTermsHash,
        string calldata newIpfsCid,
        bytes calldata gigProviderSig,
        bytes calldata freelancerSig
    ) external {
        AgreementRecord storage parent = agreements[parentAgreementId];
        if (parent.status != AgreementStatus.ACTIVE) {
            revert ParentAgreementNotActive();
        }
        if (agreements[newAgreementId].status != AgreementStatus.NONE) {
            revert AgreementAlreadyExists();
        }

        uint32 nextVersion = parent.version + 1;
        bytes32 digest = computeAmendmentDigest(
            newAgreementId,
            nextVersion,
            parentAgreementId,
            parent.gigProvider,
            parent.freelancer,
            newTermsHash
        );

        if (_recoverEthSigned(digest, gigProviderSig) != parent.gigProvider) {
            revert InvalidGigProviderSignature();
        }
        if (_recoverEthSigned(digest, freelancerSig) != parent.freelancer) {
            revert InvalidFreelancerSignature();
        }

        // Preserve immutable audit trail on parent version
        parent.status = AgreementStatus.SUPERSEDED;
        parent.supersededBy = newAgreementId;

        bytes32 rootId = parent.rootAgreementId;

        agreements[newAgreementId] = AgreementRecord({
            agreementId: newAgreementId,
            rootAgreementId: rootId,
            parentAgreementId: parentAgreementId,
            supersededBy: bytes32(0),
            version: nextVersion,
            gigProvider: parent.gigProvider,
            freelancer: parent.freelancer,
            termsHash: newTermsHash,
            ipfsCid: newIpfsCid,
            gigProviderSigHash: keccak256(gigProviderSig),
            freelancerSigHash: keccak256(freelancerSig),
            anchoredAt: uint64(block.timestamp),
            status: AgreementStatus.ACTIVE
        });

        agreementLineages[rootId].push(newAgreementId);
        allAgreementIds.push(newAgreementId);

        emit AgreementAmended(parentAgreementId, newAgreementId, rootId, nextVersion, newTermsHash);
        emit AgreementAnchored(
            newAgreementId,
            rootId,
            nextVersion,
            parent.gigProvider,
            parent.freelancer,
            newTermsHash,
            newIpfsCid
        );
    }

    /**
     * @notice Marks an active agreement COMPLETED when signed off by the gig provider.
     */
    function completeAgreement(bytes32 agreementId, bytes calldata gigProviderSig) external {
        AgreementRecord storage ag = agreements[agreementId];
        if (ag.status != AgreementStatus.ACTIVE) {
            revert ParentAgreementNotActive();
        }
        bytes32 digest = keccak256(abi.encodePacked("TRUSTWORK_COMPLETE_V1", agreementId, ag.termsHash));
        if (_recoverEthSigned(digest, gigProviderSig) != ag.gigProvider) {
            revert InvalidGigProviderSignature();
        }
        ag.status = AgreementStatus.COMPLETED;
        emit AgreementCompleted(agreementId, uint64(block.timestamp));
    }

    // =========================================================================
    // 3. MILESTONE EVIDENCE & DUAL SIGN-OFF
    // =========================================================================

    function anchorMilestoneSignOff(
        bytes32 milestoneId,
        bytes32 agreementId,
        bytes32 deliverableHash,
        string calldata evidenceCid,
        bytes calldata freelancerSig,
        bytes calldata gigProviderSig
    ) external {
        AgreementRecord storage ag = agreements[agreementId];
        require(
            ag.status == AgreementStatus.ACTIVE || ag.status == AgreementStatus.COMPLETED,
            "Agreement not active"
        );

        bytes32 digest = keccak256(
            abi.encodePacked("TRUSTWORK_MILESTONE_V1", milestoneId, agreementId, deliverableHash)
        );

        if (_recoverEthSigned(digest, freelancerSig) != ag.freelancer) {
            revert InvalidFreelancerSignature();
        }
        if (_recoverEthSigned(digest, gigProviderSig) != ag.gigProvider) {
            revert InvalidGigProviderSignature();
        }

        milestones[milestoneId] = MilestoneAnchor({
            milestoneId: milestoneId,
            agreementId: agreementId,
            deliverableHash: deliverableHash,
            evidenceCid: evidenceCid,
            freelancer: ag.freelancer,
            gigProvider: ag.gigProvider,
            signedOffAt: uint64(block.timestamp),
            verified: true
        });

        agreementMilestones[agreementId].push(milestoneId);
        emit MilestoneSignedOff(milestoneId, agreementId, deliverableHash, ag.freelancer, ag.gigProvider);
    }

    // =========================================================================
    // 4. W3C VERIFIABLE CREDENTIALS & ON-CHAIN REVOCATION REGISTRY
    // =========================================================================

    function anchorCredential(
        bytes32 credentialId,
        bytes32 vcHash,
        bytes32 agreementId,
        address issuer,
        address subject,
        string calldata ipfsCid,
        bytes calldata issuerSig
    ) external {
        if (credentials[credentialId].issuedAt != 0) {
            revert CredentialAlreadyExists();
        }
        bytes32 digest = keccak256(
            abi.encodePacked("TRUSTWORK_VC_V1", credentialId, vcHash, agreementId, issuer, subject)
        );
        if (_recoverEthSigned(digest, issuerSig) != issuer) {
            revert InvalidIssuerSignature();
        }

        credentials[credentialId] = CredentialRecord({
            credentialId: credentialId,
            vcHash: vcHash,
            agreementId: agreementId,
            issuer: issuer,
            subject: subject,
            ipfsCid: ipfsCid,
            issuedAt: uint64(block.timestamp),
            revoked: false,
            revokedAt: 0,
            revocationReason: ""
        });

        allCredentialIds.push(credentialId);
        emit CredentialAnchored(credentialId, agreementId, issuer, subject, vcHash);
    }

    function revokeCredential(
        bytes32 credentialId,
        string calldata reason,
        bytes calldata issuerSig
    ) external {
        CredentialRecord storage cred = credentials[credentialId];
        if (cred.issuedAt == 0) revert CredentialNotFound();
        if (cred.revoked) revert CredentialAlreadyRevoked();

        bytes32 digest = keccak256(
            abi.encodePacked("TRUSTWORK_REVOKE_VC_V1", credentialId, cred.vcHash, reason)
        );
        if (_recoverEthSigned(digest, issuerSig) != cred.issuer) {
            revert InvalidIssuerSignature();
        }

        cred.revoked = true;
        cred.revokedAt = uint64(block.timestamp);
        cred.revocationReason = reason;

        emit CredentialRevoked(credentialId, cred.issuer, reason, uint64(block.timestamp));
    }

    // =========================================================================
    // 5. 1-SECOND INDEPENDENT ON-CHAIN AUDIT FUNCTIONS
    // =========================================================================

    function auditAgreement(
        bytes32 agreementId,
        bytes32 candidateTermsHash
    )
        external
        view
        returns (
            bool exists,
            bool hashMatches,
            AgreementStatus status,
            uint32 version,
            address gigProvider,
            address freelancer,
            uint64 anchoredAt,
            bytes32 parentAgreementId,
            bytes32 supersededBy
        )
    {
        AgreementRecord storage ag = agreements[agreementId];
        if (ag.status == AgreementStatus.NONE) {
            return (false, false, AgreementStatus.NONE, 0, address(0), address(0), 0, bytes32(0), bytes32(0));
        }
        return (
            true,
            ag.termsHash == candidateTermsHash,
            ag.status,
            ag.version,
            ag.gigProvider,
            ag.freelancer,
            ag.anchoredAt,
            ag.parentAgreementId,
            ag.supersededBy
        );
    }

    function auditCredential(
        bytes32 credentialId,
        bytes32 candidateVcHash
    )
        external
        view
        returns (
            bool exists,
            bool hashMatches,
            bool isRevoked,
            address issuer,
            IssuerTier issuerTier,
            address subject,
            uint64 issuedAt,
            uint64 revokedAt,
            string memory revocationReason
        )
    {
        CredentialRecord storage cred = credentials[credentialId];
        if (cred.issuedAt == 0) {
            return (false, false, false, address(0), IssuerTier.INDIVIDUAL, address(0), 0, 0, "");
        }
        IssuerTier tier = identities[cred.issuer].active
            ? identities[cred.issuer].tier
            : IssuerTier.INDIVIDUAL;
        return (
            true,
            cred.vcHash == candidateVcHash,
            cred.revoked,
            cred.issuer,
            tier,
            cred.subject,
            cred.issuedAt,
            cred.revokedAt,
            cred.revocationReason
        );
    }

    function getAgreementLineage(bytes32 rootAgreementId) external view returns (bytes32[] memory) {
        return agreementLineages[rootAgreementId];
    }

    function getAgreementMilestones(bytes32 agreementId) external view returns (bytes32[] memory) {
        return agreementMilestones[agreementId];
    }

    function getProtocolStats()
        external
        view
        returns (uint256 totalIdentities, uint256 totalAgreements, uint256 totalCredentials)
    {
        return (identityList.length, allAgreementIds.length, allCredentialIds.length);
    }

    // =========================================================================
    // INTERNAL CRYPTOGRAPHIC PRIMITIVES (EIP-191 + secp256k1 ecrecover)
    // =========================================================================

    function _recoverEthSigned(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", digest)
        );
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(ethSignedHash, v, r, s);
    }
}
