import Foundation
import Observation

/// App-level session cache — org context, credits, and user profile for global chrome.
@MainActor
@Observable
final class SessionStore {
    private(set) var session: SessionResponse?
    private(set) var isLoading = false
    private(set) var isSwitchingOrg = false
    /// Incremented on org switch so tabs can reload org-scoped data.
    private(set) var orgGeneration = 0

    var activeOrganizationId: String? {
        session?.organization?.id
            ?? session?.organizations.first(where: \.isActive)?.id
    }

    var activeOrg: OrgMembership? {
        guard let id = activeOrganizationId else { return nil }
        return session?.organizations.first { $0.id == id }
    }

    var credits: Int { session?.credits ?? 0 }
    var tier: String { session?.tier ?? "free" }
    var isTierExpired: Bool { session?.isTierExpired ?? false }
    var isCrewMember: Bool { session?.isCrewMember ?? false }
    var userImageURL: URL? {
        guard let raw = session?.user.image?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty,
              let url = URL(string: raw),
              url.scheme == "https"
        else { return nil }
        return url
    }

    func load(api: RationAPI) async {
        isLoading = true
        defer { isLoading = false }
        do {
            session = try await api.session()
        } catch {
            // Keep prior session on transient failure.
        }
    }

    func activateOrg(
        _ org: OrgMembership,
        api: RationAPI,
        auth: AuthManager,
        snapshots: SnapshotStore
    ) async throws {
        guard !org.isActive else { return }
        isSwitchingOrg = true
        defer { isSwitchingOrg = false }
        let pair = try await api.activateOrg(org.id)
        auth.adopt(pair)
        snapshots.clearAll()
        session = try await api.session()
        orgGeneration += 1
    }
}
