import Foundation

// MARK: - Auth

/// `POST /api/mobile/v1/auth/token` response (issueMobileTokenPair).
struct TokenPair: Codable, Sendable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
}

struct MagicLinkResponse: Codable, Sendable {
    let sent: Bool
}

// MARK: - Session / Organization

struct MobileUser: Codable, Sendable, Identifiable {
    let id: String
    let name: String?
    let email: String
    let image: String?
}

struct Organization: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let slug: String?
    let logo: String?
    let credits: Int
}

struct OrgMembership: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let slug: String?
    let logo: String?
    let credits: Int
    let role: String
    let isActive: Bool
    let isPersonal: Bool?

    var canManageLogo: Bool { role == "owner" || role == "admin" }
    var canManageSupplySettings: Bool { role == "owner" || role == "admin" }
    var canManageGroupProfile: Bool { role == "owner" || role == "admin" }

    var isPersonalGroup: Bool {
        isPersonal ?? false
    }
}

/// Credit costs for AI features — mirrors `AI_COSTS` from ledger.server.
struct AICosts: Codable, Sendable {
    let scan: Int
    let mealGenerate: Int
    let importUrl: Int
    let organizeCargo: Int
    let mealPlanWeekly: Int

    enum CodingKeys: String, CodingKey {
        case scan = "SCAN"
        case mealGenerate = "MEAL_GENERATE"
        case importUrl = "IMPORT_URL"
        case organizeCargo = "ORGANIZE_CARGO"
        case mealPlanWeekly = "MEAL_PLAN_WEEKLY"
    }
}

/// Boolean client-safe Flagship flags from `GET /api/mobile/v1/session`.
/// Missing keys default off (fail closed for AI entry points).
struct ClientFlags: Codable, Sendable, Equatable {
    var appleWebLogin: Bool?
    var rationCopilot: Bool?
    var aiImportUrl: Bool?
    var aiScanReceipt: Bool?
    var aiDockFromReceipt: Bool?
    var aiGenerateMeal: Bool?
    var aiPlanWeek: Bool?
    var appReviewLogin: Bool?

    static let disabled = ClientFlags()

    var isRationCopilotEnabled: Bool { rationCopilot == true }
    var isAiImportUrlEnabled: Bool { aiImportUrl == true }
    var isAiScanReceiptEnabled: Bool { aiScanReceipt == true }
    var isAiDockFromReceiptEnabled: Bool {
        aiDockFromReceipt == true && aiScanReceipt == true
    }
    var isAiGenerateMealEnabled: Bool { aiGenerateMeal == true }
    var isAiPlanWeekEnabled: Bool { aiPlanWeek == true }
    var isAppReviewLoginEnabled: Bool { appReviewLogin == true }
}

/// `GET /api/mobile/v1/client-flags` (unsigned)
struct ClientFlagsResponse: Codable, Sendable {
    let clientFlags: ClientFlags
}

/// `GET /api/mobile/v1/session`
struct SessionResponse: Codable, Sendable {
    let user: MobileUser
    let organization: Organization?
    let credits: Int
    let tier: String
    let isTierExpired: Bool
    let organizations: [OrgMembership]
    let aiCosts: AICosts?
    let clientFlags: ClientFlags?

    var isCrewMember: Bool { tier == "crew_member" && !isTierExpired }

    var flags: ClientFlags { clientFlags ?? .disabled }
}

// MARK: - Groups

struct GroupMemberUser: Codable, Sendable {
    let name: String?
    let email: String
    let image: String?
}

struct GroupMember: Codable, Sendable, Identifiable {
    let id: String
    let role: String
    let user: GroupMemberUser
}

struct GroupMembersResponse: Codable, Sendable {
    let members: [GroupMember]
}

struct CreateGroupRequest: Encodable, Sendable {
    let name: String
}

struct CreateGroupResponse: Codable, Sendable {
    let success: Bool
    let organizationId: String
}

struct CreateGroupInvitationResponse: Codable, Sendable {
    let success: Bool
    let invitationId: String
    let expiresAt: Date?
}

struct UpdateGroupMemberRoleRequest: Encodable, Sendable {
    let role: String
}

struct UpdateGroupMemberRoleResponse: Codable, Sendable {
    let success: Bool
    let memberId: String?
    let role: String?
}

struct TransferGroupOwnershipRequest: Encodable, Sendable {
    let newOwnerMemberId: String
}

struct TransferGroupOwnershipResponse: Codable, Sendable {
    let success: Bool
}

struct DeleteGroupRequest: Encodable, Sendable {
    let organizationId: String
    var confirmSlug: String?
}

struct DeleteGroupResponse: Codable, Sendable {
    let success: Bool
    let organizations: [OrgMembership]
}

struct OrganizationsResponse: Codable, Sendable {
    let organizations: [OrgMembership]
}

struct AvatarUploadResponse: Codable, Sendable {
    let success: Bool
    let imageUrl: String
}

struct OrgAvatarUploadResponse: Codable, Sendable {
    let success: Bool
    let logoUrl: String
}

struct ShareStatusResponse: Codable, Sendable {
    let shareUrl: String?
    let shareExpiresAt: String?
}

struct ShareCreateResponse: Codable, Sendable {
    let shareToken: String
    let shareUrl: String
    let shareExpiresAt: String
}

struct ShareRevokeResponse: Codable, Sendable {
    let revoked: Bool
}

struct AccountDeleteResponse: Codable, Sendable {
    let success: Bool
    let deleted: Bool
}

struct AccountDeletionPreviewResponse: Codable, Sendable {
    let ownedGroupsWithNoOtherMembers: [String]
    let canDelete: Bool
    let blockReason: String?
    let cancelAtPeriodEnd: Bool
    let tierExpiresAt: String?
    let message: String
    let managementUrl: String?
    let billingProvider: String?

    var deletionAllowed: Bool { canDelete }
    var isCancelAtPeriodEnd: Bool { cancelAtPeriodEnd }
}
