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
    /// Non-nil while the user must pick a group after deleting their active org or losing access.
    private(set) var orgSelectionOrganizations: [OrgMembership]?

    var needsOrgSelection: Bool { orgSelectionOrganizations != nil }

    /// Shared AI-consent flag (see H-8) — populated at app start by `RootView`
    /// via `loadSettings()` + `applyConsent(_:)` and read by
    /// `AIConsentCoordinator.presentIfNeeded` across all four AI entry points
    /// (scan, generate, import, plan-week), so consent granted from any one of
    /// them is immediately visible to the others without a second network
    /// fetch or a second prompt.
    private(set) var hasAIConsent = false

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
    /// Client-safe Flagship flags; defaults off until session loads.
    var clientFlags: ClientFlags { session?.flags ?? .disabled }
    var userImageURL: URL? {
        AvatarURLResolver.resolve(session?.user.image)
    }

    @discardableResult
    func load(api: RationAPI) async -> Bool {
        isLoading = true
        defer { isLoading = false }
        do {
            session = try await api.session()
            return true
        } catch {
            // Keep prior session on transient failure.
            return false
        }
    }

    /// Derives the shared AI-consent flag from a `UserSettings` response the
    /// caller already has in hand (e.g. `RootView`'s startup `loadSettings()`
    /// fetch, or a `patchSettings` response) — avoids a redundant
    /// `GET /settings` round-trip just to re-derive this flag.
    func applyConsent(_ settings: UserSettings) {
        hasAIConsent = settings.aiConsentAt?.isEmpty == false
    }

    /// Marks consent granted immediately after a successful PATCH, so the
    /// other three AI entry points reflect it without re-fetching settings.
    func markAIConsentGranted() {
        hasAIConsent = true
    }

    /// Clears the in-memory session cache — called on forced logout (H-2).
    /// Unlike org switch, a forced 401 has no valid token left to re-fetch
    /// with, so this must be an explicit clear rather than a re-fetch.
    func clear() {
        session = nil
        hasAIConsent = false
        orgSelectionOrganizations = nil
    }

    /// Enter org-selection mode after deleting the active group or losing org access.
    func beginOrgSelection(organizations: [OrgMembership]) {
        if orgSelectionOrganizations != nil {
            if !organizations.isEmpty {
                orgSelectionOrganizations = organizations
            }
            return
        }
        session = nil
        orgSelectionOrganizations = organizations
    }

    func completeOrgSelection() {
        orgSelectionOrganizations = nil
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
        if let oldLogo = activeOrg?.logo, let url = AvatarURLResolver.resolve(oldLogo) {
            AuthImageLoader.shared.invalidate(url: url)
        }
        await snapshots.clearAll()
        session = try await api.session()
        orgGeneration += 1
    }
}
