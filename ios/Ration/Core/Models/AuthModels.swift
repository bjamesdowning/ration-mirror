import Foundation

// MARK: - Auth

/// `POST /api/mobile/v1/auth/token` response (issueMobileTokenPair).
struct TokenPair: Codable, Sendable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
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

/// Kill-switch flags from `GET /api/mobile/v1/session` for AI entry points.
/// Missing keys default off. Every other 1.5 feature ships on and is not read here.
struct ClientFlags: Codable, Sendable, Equatable {
    var rationCopilot: Bool?
    var aiImportUrl: Bool?
    var aiImportWeb: Bool?
    var aiImportSocial: Bool?
    var aiImportPhoto: Bool?
    var aiScanReceipt: Bool?
    var aiDockFromReceipt: Bool?
    var aiGenerateMeal: Bool?
    var aiPlanWeek: Bool?

    static let disabled = ClientFlags()

    var isRationCopilotEnabled: Bool { rationCopilot == true }
    var isAiImportUrlEnabled: Bool { aiImportUrl == true }
    var isAiImportWebEnabled: Bool { aiImportWeb == true }
    var isAiImportSocialEnabled: Bool { aiImportSocial == true }
    var isAiImportPhotoEnabled: Bool { aiImportPhoto == true }
    var isAiScanReceiptEnabled: Bool { aiScanReceipt == true }
    var isAiDockFromReceiptEnabled: Bool {
        aiDockFromReceipt == true && aiScanReceipt == true
    }
    var isAiGenerateMealEnabled: Bool { aiGenerateMeal == true }
    var isAiPlanWeekEnabled: Bool { aiPlanWeek == true }
}

/// `GET /api/mobile/v1/session`
struct SessionResponse: Codable, Sendable {
    let user: MobileUser
    let organization: Organization?
    let credits: Int
    /// Organization effective tier (owner-derived household capacity).
    let tier: String
    let isTierExpired: Bool
    /// Personal subscription tier (purchase / "Your plan").
    let accountTier: String?
    let accountTierExpired: Bool?
    let organizations: [OrgMembership]
    let aiCosts: AICosts?
    let clientFlags: ClientFlags?

    /// Group-scoped Crew capacity for the active organization.
    var isCrewMember: Bool { tier == "crew_member" && !isTierExpired }

    /// Personal Crew subscription ownership (independent of active group).
    var isAccountCrewMember: Bool {
        let personal = accountTier ?? "free"
        let expired = accountTierExpired ?? false
        return personal == "crew_member" && !expired
    }

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
    var acknowledgeCreditForfeit: Bool?
}

struct DeleteGroupResponse: Codable, Sendable {
    let success: Bool
    let organizations: [OrgMembership]
}

struct RemoveGroupMemberResponse: Codable, Sendable {
    let success: Bool
    let memberId: String?
}

struct LeaveGroupResponse: Codable, Sendable {
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
    let message: String?
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
