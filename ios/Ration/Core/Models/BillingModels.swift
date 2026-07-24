import Foundation

struct TransferCreditsRequest: Encodable, Sendable {
    let sourceOrganizationId: String
    let destinationOrganizationId: String
    let amount: Int
}

struct TransferCreditsResponse: Codable, Sendable {
    let success: Bool
}

// MARK: - Billing

struct EntitlementInfo: Codable, Sendable {
    let active: Bool
    let expiresAt: String?
    let store: String?
}

struct BillingManagement: Codable, Sendable {
    let store: String?
    let url: String?
}

/// `GET /api/mobile/v1/billing/status`
struct BillingStatus: Codable, Sendable {
    struct Entitlements: Codable, Sendable {
        let crew_member: EntitlementInfo
    }
    /// Personal account tier (purchase ownership). Same as `accountTier` when present.
    let tier: String
    let entitlements: Entitlements
    let management: BillingManagement
    let canPurchaseSubscription: Bool
    let purchaseBlockReason: String?
    let billingUnavailable: Bool
    let credits: Int
    /// Explicit personal tier from the server (additive; falls back to `tier`).
    let accountTier: String?
    let accountTierExpired: Bool?
    /// Active organization owner-derived capacity tier.
    let organizationTier: String?
    let organizationTierExpired: Bool?

    /// Personal Crew subscription ownership — not household-only capacity.
    var isPersonalCrewActive: Bool {
        BillingOwnership.isPersonalCrewActive(
            entitlementsActive: entitlements.crew_member.active,
            accountTier: accountTier,
            fallbackTier: tier
        )
    }
}
