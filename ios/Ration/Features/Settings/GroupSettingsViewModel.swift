import SwiftUI
import Observation

enum CreateGroupResult: Equatable {
    case success
    case showPaywall
    case crewGroupLimitReached(limit: Int)
    case failure(String)
}

@MainActor
@Observable
final class GroupSettingsViewModel {
    private(set) var members: [GroupMember] = []
    private(set) var session: SessionResponse?
    private(set) var isLoading = false
    private(set) var isCreatingGroup = false
    private(set) var isInviting = false
    private(set) var updatingMemberId: String?
    var errorMessage: String?
    var successMessage: String?
    var inviteLink: String?
    var newGroupName = ""
    var newGroupSlug = ""
    var slugManuallyEdited = false

    var currentUserRole: String {
        session?.organizations.first(where: \.isActive)?.role ?? "member"
    }

    var isOwner: Bool { currentUserRole == "owner" }

    var nonOwnerMembers: [GroupMember] {
        members.filter { $0.role != "owner" }
    }

    func load(api: RationAPI) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let sessionTask = api.session()
            async let membersTask = api.groupMembers()
            session = try await sessionTask
            members = try await membersTask.members
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func syncSlugFromName() {
        guard !slugManuallyEdited else { return }
        newGroupSlug = GroupSettingsSupport.slugSuggestion(from: newGroupName)
    }

    func createGroup(api: RationAPI, env: AppEnvironment) async -> CreateGroupResult {
        let name = newGroupName.trimmingCharacters(in: .whitespacesAndNewlines)
        let slug = newGroupSlug.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, GroupSettingsSupport.isValidSlug(slug) else {
            let message = "Enter a group name and valid slug (lowercase letters, numbers, hyphens)."
            errorMessage = message
            return .failure(message)
        }
        isCreatingGroup = true
        errorMessage = nil
        successMessage = nil
        defer { isCreatingGroup = false }
        do {
            let response = try await api.createGroup(name: name, slug: slug)
            newGroupName = ""
            newGroupSlug = ""
            slugManuallyEdited = false
            _ = await env.session.load(api: api)
            if let org = env.session.session?.organizations.first(where: { $0.id == response.organizationId }) {
                try await env.session.activateOrg(org, api: api, auth: env.auth, snapshots: env.snapshots)
            }
            session = env.session.session
            members = try await api.groupMembers().members
            successMessage = "Group created"
            Haptics.success()
            return .success
        } catch let error as APIError {
            if let outcome = GroupSettingsSupport.createGroupOutcome(
                from: error,
                isCrewMember: session?.isCrewMember ?? env.session.isCrewMember
            ) {
                if case .crewGroupLimitReached(let limit) = outcome {
                    errorMessage = "Your Crew plan supports up to \(limit) groups."
                }
                return outcome
            }
            errorMessage = error.errorDescription
            return .failure(error.errorDescription ?? "Something went wrong.")
        } catch {
            errorMessage = error.localizedDescription
            return .failure(error.localizedDescription)
        }
    }

    func inviteMember(api: RationAPI) async -> Bool {
        isInviting = true
        errorMessage = nil
        defer { isInviting = false }
        do {
            let response = try await api.createGroupInvitation()
            inviteLink = GroupSettingsSupport.invitationAcceptURL(invitationId: response.invitationId).absoluteString
            Haptics.success()
            return true
        } catch let error as APIError {
            if case .server(403, let message, _, _, _) = error, message == "feature_gated" {
                return false
            }
            errorMessage = error.errorDescription
            return false
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func updateRole(memberId: String, role: String, api: RationAPI) async {
        updatingMemberId = memberId
        errorMessage = nil
        defer { updatingMemberId = nil }
        do {
            _ = try await api.updateGroupMemberRole(memberId: memberId, role: role)
            members = try await api.groupMembers().members
            successMessage = "Role updated"
            Haptics.success()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func transferOwnership(to memberId: String, api: RationAPI, env: AppEnvironment) async -> Bool {
        errorMessage = nil
        do {
            _ = try await api.transferGroupOwnership(newOwnerMemberId: memberId)
            _ = await env.session.load(api: api)
            session = env.session.session
            members = try await api.groupMembers().members
            successMessage = "Ownership transferred"
            Haptics.success()
            return true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }

    func deleteGroup(api: RationAPI, env: AppEnvironment) async -> Bool {
        guard let orgId = session?.organizations.first(where: \.isActive)?.id else { return false }
        errorMessage = nil
        do {
            _ = try await api.deleteGroup(organizationId: orgId)
            _ = await env.session.load(api: api)
            session = env.session.session

            if let session {
                if session.organizations.isEmpty {
                    await env.auth.signOut()
                } else if !session.organizations.contains(where: \.isActive),
                          let next = session.organizations.first {
                    await activateOrg(next, env: env)
                }
            } else {
                await env.auth.signOut()
            }

            Haptics.success()
            return true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }

    func activateOrg(_ org: OrgMembership, env: AppEnvironment) async {
        guard !org.isActive else { return }
        do {
            try await env.session.activateOrg(org, api: env.api, auth: env.auth, snapshots: env.snapshots)
            session = env.session.session
            members = try await env.api.groupMembers().members
            inviteLink = nil
            Haptics.success()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
