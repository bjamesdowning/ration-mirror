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
    /// Shared AI-consent flag (see H-8) — loaded once at app start via
    /// `loadConsent(api:)` and read by `AIConsentCoordinator.presentIfNeeded`
    /// across all four AI entry points (scan, generate, import, plan-week),
    /// so consent granted from any one of them is immediately visible to the
    /// others without a second network fetch or a second prompt.
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
    var userImageURL: URL? {
        AvatarURLResolver.resolve(session?.user.image)
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

    /// Loads the server-recorded AI consent flag. Call once at app start
    /// (see `RootView`) — the four AI entry points read `hasAIConsent`
    /// directly rather than each re-fetching settings.
    func loadConsent(api: RationAPI) async {
        do {
            let settings = try await api.settings().settings
            applyConsent(settings)
        } catch {
            // Keep prior value on transient failure — a network blip should
            // not flip previously-granted consent back to "not granted".
        }
    }

    /// Sync counterpart to `loadConsent(api:)` for call sites that already
    /// have a fresh `UserSettings` response in hand (e.g. `RootView`'s
    /// startup fetch, or a `patchSettings` response) — avoids a redundant
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
        snapshots.clearAll()
        session = try await api.session()
        orgGeneration += 1
    }
}
