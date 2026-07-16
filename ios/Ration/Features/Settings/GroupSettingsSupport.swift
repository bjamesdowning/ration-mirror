import Foundation

/// Pure helpers for Group Settings gating and formatting — covered by unit tests.
enum GroupSettingsSupport {
    static func memberDisplayName(_ user: GroupMemberUser) -> String {
        if let name = user.name, !name.isEmpty { return name }
        return user.email
    }

    static func canShowInviteButton(currentUserRole: String) -> Bool {
        ["owner", "admin"].contains(currentUserRole)
    }

    static func canManageMemberRole(currentUserRole: String, targetRole: String) -> Bool {
        if targetRole == "owner" { return false }
        if currentUserRole == "owner" { return true }
        if currentUserRole == "admin", targetRole == "member" { return true }
        return false
    }

    static func rolePickerOptions(currentUserRole: String) -> [String] {
        currentUserRole == "owner" ? ["member", "admin"] : []
    }

    static func adminPromoteOnly(currentUserRole: String, targetRole: String) -> Bool {
        currentUserRole == "admin" && targetRole == "member"
    }

    static func canTransferOwnership(isOwner: Bool, nonOwnerMemberCount: Int) -> Bool {
        isOwner && nonOwnerMemberCount > 0
    }

    static func canDeleteGroup(isOwner: Bool, isPersonalGroup: Bool = false) -> Bool {
        isOwner && !isPersonalGroup
    }

    static func canTransferCredits(organizations: [OrgMembership]) -> Bool {
        let ownerWithCredits = organizations.contains { $0.role == "owner" && $0.credits > 0 }
        return ownerWithCredits && organizations.count >= 2
    }

    /// Clamps a transfer amount to `[1, min(sourceCredits, 10_000)]`.
    static func clampedTransferAmount(_ amount: Int, sourceCredits: Int) -> Int {
        let maxAmount = min(max(sourceCredits, 1), 10_000)
        return min(max(amount, 1), maxAmount)
    }

    /// Max transferable from a source org (same cap as the mobile/web API).
    static func maxTransferAmount(sourceCredits: Int) -> Int {
        min(max(sourceCredits, 1), 10_000)
    }

    static func ownedGroupCount(in organizations: [OrgMembership]) -> Int {
        organizations.filter { $0.role == "owner" }.count
    }

    static func maxOwnedGroups(isCrewMember: Bool) -> Int {
        isCrewMember ? 5 : 1
    }

    static func canCreateGroup(organizations: [OrgMembership], isCrewMember: Bool) -> Bool {
        ownedGroupCount(in: organizations) < maxOwnedGroups(isCrewMember: isCrewMember)
    }

    static func ownedGroupLimitMessage(limit: Int, isCrewMember: Bool) -> String {
        if isCrewMember {
            return "You've reached your \(limit)-group limit. Delete a group you own to create another."
        }
        return "Your free plan includes 1 group. Upgrade to Crew to create more."
    }

    static func invitationAcceptURL(invitationId: String, webOrigin: URL = AppConfig.webOrigin) -> URL {
        var components = URLComponents(url: webOrigin.appending(path: "invitations/accept"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "id", value: invitationId)]
        return components.url ?? webOrigin
    }

    static func slugSuggestion(from name: String) -> String {
        let lowered = name.lowercased()
        var slug = ""
        var previousHyphen = false
        for character in lowered {
            if character.isLetter || character.isNumber {
                slug.append(character)
                previousHyphen = false
            } else if character == " " || character == "-" || character == "_" {
                if !slug.isEmpty, !previousHyphen {
                    slug.append("-")
                    previousHyphen = true
                }
            }
        }
        while slug.hasSuffix("-") { slug.removeLast() }
        return slug
    }

    static func isValidSlug(_ slug: String) -> Bool {
        guard !slug.isEmpty else { return false }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789-")
        return slug.unicodeScalars.allSatisfy { allowed.contains($0) }
    }

    /// Maps create-group API errors to UI outcomes (paywall vs Crew limit message).
    static func createGroupOutcome(from error: APIError, isCrewMember: Bool) -> CreateGroupResult? {
        guard case .server(403, _, _, _, let limit, _, _) = error else { return nil }
        let code = error.serverErrorCode
        if code == "feature_gated" { return .showPaywall }
        if code == "capacity_exceeded" {
            let resolvedLimit = limit ?? maxOwnedGroups(isCrewMember: isCrewMember)
            return isCrewMember ? .crewGroupLimitReached(limit: resolvedLimit) : .showPaywall
        }
        return nil
    }

    static func transferOwnershipErrorMessage(from error: APIError) -> String? {
        guard case .server = error else { return nil }
        if error.serverErrorCode == "recipient_capacity_exceeded" {
            // Prefer human server message; skip when description is only the machine code
            // (APIClient falls back to `error` when `message` is absent).
            if let description = error.errorDescription,
               !description.isEmpty,
               description != error.serverErrorCode {
                return description
            }
            if let limit = error.serverLimit {
                return "This member already owns the maximum number of groups (\(limit)) and cannot take ownership of another."
            }
        }
        return error.errorDescription
    }

    static func createGroupErrorMessage(from outcome: CreateGroupResult) -> String? {
        if case .crewGroupLimitReached(let limit) = outcome {
            return ownedGroupLimitMessage(limit: limit, isCrewMember: true)
        }
        return nil
    }
}
