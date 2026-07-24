import Foundation

// MARK: - Settings

struct OrganizationSupplySettings: Codable, Sendable {
    var manifestHorizonDays: Int?
}

struct SupplyPlanningWindow: Codable, Sendable {
    let startDate: String
    let endDate: String
    let horizonDays: Int
}

struct OrganizationSupplySettingsResponse: Codable, Sendable {
    let supplySettings: OrganizationSupplySettings
    let window: SupplyPlanningWindow
}

struct OrganizationSupplySettingsPatch: Encodable, Sendable {
    let manifestHorizonDays: Int
}

struct OrganizationProfilePatchRequest: Encodable, Sendable {
    let name: String
}

struct OrganizationProfilePatchResponse: Codable, Sendable {
    let id: String
    let name: String
    let slug: String?
    let logo: String?
    let credits: Int
}

struct ManifestSettings: Codable, Sendable {
    var weekStart: String?
    var defaultSlots: [String]?
    var showSnackSlot: Bool?
    var calendarSpan: Int?
}

struct UserSettings: Codable, Sendable {
    var theme: String?
    var supplyUnitMode: String?
    var unitDisplayMode: String?
    var allergens: [String]?
    var aiConsentAt: String?
    var onboardingCompletedAt: String?
    var onboardingStep: Int?
    var expirationAlertDays: Int?
    var hubProfile: HubProfile?
    var hubLayout: HubLayoutPayload?
    var manifestSettings: ManifestSettings?
}

struct SettingsResponse: Codable, Sendable {
    let settings: UserSettings
}

struct SettingsPatch: Encodable, Sendable {
    var theme: String?
    var supplyUnitMode: String?
    var unitDisplayMode: String?
    var allergens: [String]?
    var aiConsentAt: String?
    var onboardingCompletedAt: String?
    var onboardingStep: Int?
    var restartOnboarding: Bool?
    var expirationAlertDays: Int?
    var hubProfile: HubProfile?
    var hubLayout: HubLayoutPayload?
    var manifestSettings: ManifestSettings?
}
