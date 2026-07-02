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

    static func canDeleteGroup(isOwner: Bool) -> Bool {
        isOwner
    }

    static func canTransferCredits(organizations: [OrgMembership]) -> Bool {
        let ownerWithCredits = organizations.contains { $0.role == "owner" && $0.credits > 0 }
        return ownerWithCredits && organizations.count >= 2
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
        guard case .server(403, let message, _, _, _) = error else { return nil }
        if message == "feature_gated" { return .showPaywall }
        if message == "capacity_exceeded" {
            return isCrewMember ? .crewGroupLimitReached(limit: 5) : .showPaywall
        }
        return nil
    }
}
