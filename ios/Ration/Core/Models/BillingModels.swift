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
    let tier: String
    let entitlements: Entitlements
    let management: BillingManagement
    let canPurchaseSubscription: Bool
    let purchaseBlockReason: String?
    let billingUnavailable: Bool
    let credits: Int
}
