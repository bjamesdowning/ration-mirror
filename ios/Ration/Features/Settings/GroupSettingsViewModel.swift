import SwiftUI
import Observation

enum CreateGroupResult: Equatable {
    case success
    case showPaywall
    case crewGroupLimitReached(limit: Int)
    case failure(String)
}

enum DeleteGroupOutcome: Equatable {
    case needsOrgSelection
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
    var createGroupError: String?
    var transferError: String?
    var successMessage: String?
    var inviteLink: String?
    var newGroupName = ""
    var editedGroupName = ""
    private var syncedGroupName = ""
    private(set) var isSavingGroupName = false

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
            if let activeName = session?.organizations.first(where: \.isActive)?.name {
                if editedGroupName.isEmpty || editedGroupName == syncedGroupName {
                    editedGroupName = activeName
                }
                syncedGroupName = activeName
            }
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func createGroup(api: RationAPI, env: AppEnvironment) async -> CreateGroupResult {
        let name = newGroupName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else {
            let message = "Enter a group name."
            createGroupError = message
            return .failure(message)
        }
        isCreatingGroup = true
        errorMessage = nil
        createGroupError = nil
        successMessage = nil
        defer { isCreatingGroup = false }
        do {
            let response = try await api.createGroup(name: name)
            newGroupName = ""
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
                createGroupError = GroupSettingsSupport.createGroupErrorMessage(from: outcome)
                return outcome
            }
            let message = error.errorDescription ?? "Something went wrong."
            createGroupError = message
            return .failure(message)
        } catch {
            let message = error.localizedDescription
            createGroupError = message
            return .failure(message)
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
            if error.statusCode == 403, error.serverErrorCode == "feature_gated" {
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
        transferError = nil
        do {
            _ = try await api.transferGroupOwnership(newOwnerMemberId: memberId)
            _ = await env.session.load(api: api)
            session = env.session.session
            members = try await api.groupMembers().members
            successMessage = "Ownership transferred"
            Haptics.success()
            return true
        } catch let error as APIError {
            transferError = GroupSettingsSupport.transferOwnershipErrorMessage(from: error)
                ?? error.errorDescription
            return false
        } catch {
            transferError = error.localizedDescription
            return false
        }
    }

    func deleteGroup(api: RationAPI, env: AppEnvironment) async -> DeleteGroupOutcome {
        guard let orgId = session?.organizations.first(where: \.isActive)?.id else {
            return .failure("No active group to delete.")
        }
        errorMessage = nil
        do {
            let response = try await api.deleteGroup(organizationId: orgId)
            await env.snapshots.clearAll()
            env.refreshOutcomes.clearAll()
            env.session.beginOrgSelection(organizations: response.organizations)
            Haptics.success()
            return .needsOrgSelection
        } catch {
            let message = (error as? APIError)?.errorDescription ?? error.localizedDescription
            errorMessage = message
            return .failure(message)
        }
    }

    func saveGroupName(api: RationAPI, env: AppEnvironment) async -> Bool {
        let trimmed = editedGroupName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            errorMessage = "Enter a group name."
            return false
        }
        guard let activeName = session?.organizations.first(where: \.isActive)?.name,
              trimmed != activeName else {
            return false
        }

        isSavingGroupName = true
        errorMessage = nil
        successMessage = nil
        defer { isSavingGroupName = false }

        do {
            _ = try await api.patchOrganizationProfile(name: trimmed)
            _ = await env.session.load(api: api)
            session = env.session.session
            syncedGroupName = trimmed
            editedGroupName = env.session.activeOrg?.name ?? trimmed
            successMessage = "Group name updated"
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
