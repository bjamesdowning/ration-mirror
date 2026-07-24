import Foundation

/// Typed facade over `APIClient` — one method per `/api/mobile/v1` route used by the app.
@MainActor
final class RationAPI {
    let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    // Session / org
    func session() async throws -> SessionResponse {
        try await client.get("session")
    }

    func activateOrg(_ id: String) async throws -> TokenPair {
        try await client.post("orgs/\(id)/activate", body: EmptyBody())
    }

    func organizations() async throws -> OrganizationsResponse {
        try await client.get("orgs")
    }

    func deleteAccount() async throws -> AccountDeleteResponse {
        try await client.delete("account")
    }

    func accountDeletionPreview() async throws -> AccountDeletionPreviewResponse {
        try await client.get("account")
    }

    func copilotStatus() async throws -> CopilotStatusResponse {
        try await client.get("copilot/status")
    }

    func updateCopilotConsent(autoDeductConsent: Bool) async throws -> CopilotStatusResponse {
        try await client.post(
            "copilot/consent",
            body: CopilotConsentRequest(autoDeductConsent: autoDeductConsent)
        )
    }

    // Settings
    func settings() async throws -> SettingsResponse {
        try await client.get("settings")
    }

    func patchSettings(_ patch: SettingsPatch) async throws -> SettingsResponse {
        try await client.patch("settings", body: patch)
    }

    func organizationSupplySettings() async throws -> OrganizationSupplySettingsResponse {
        try await client.get("organization/supply-settings")
    }

    func patchOrganizationSupplySettings(
        manifestHorizonDays: Int
    ) async throws -> OrganizationSupplySettingsResponse {
        try await client.patch(
            "organization/supply-settings",
            body: OrganizationSupplySettingsPatch(manifestHorizonDays: manifestHorizonDays)
        )
    }

    func patchOrganizationProfile(name: String) async throws -> OrganizationProfilePatchResponse {
        try await client.patch(
            "organization/profile",
            body: OrganizationProfilePatchRequest(name: name)
        )
    }

    // Hub
    func hub() async throws -> HubResponse {
        try await client.get("hub")
    }
}
