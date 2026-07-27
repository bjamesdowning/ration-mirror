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
    /// When true, encodes `aiConsentAt: null` so the server clears consent.
    var clearAIConsent: Bool = false
    var onboardingCompletedAt: String?
    var onboardingStep: Int?
    var restartOnboarding: Bool?
    var expirationAlertDays: Int?
    var hubProfile: HubProfile?
    var hubLayout: HubLayoutPayload?
    var manifestSettings: ManifestSettings?

    enum CodingKeys: String, CodingKey {
        case theme
        case supplyUnitMode
        case unitDisplayMode
        case allergens
        case aiConsentAt
        case onboardingCompletedAt
        case onboardingStep
        case restartOnboarding
        case expirationAlertDays
        case hubProfile
        case hubLayout
        case manifestSettings
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(theme, forKey: .theme)
        try container.encodeIfPresent(supplyUnitMode, forKey: .supplyUnitMode)
        try container.encodeIfPresent(unitDisplayMode, forKey: .unitDisplayMode)
        try container.encodeIfPresent(allergens, forKey: .allergens)
        if let aiConsentAt {
            try container.encode(aiConsentAt, forKey: .aiConsentAt)
        } else if clearAIConsent {
            try container.encodeNil(forKey: .aiConsentAt)
        }
        try container.encodeIfPresent(onboardingCompletedAt, forKey: .onboardingCompletedAt)
        try container.encodeIfPresent(onboardingStep, forKey: .onboardingStep)
        try container.encodeIfPresent(restartOnboarding, forKey: .restartOnboarding)
        try container.encodeIfPresent(expirationAlertDays, forKey: .expirationAlertDays)
        try container.encodeIfPresent(hubProfile, forKey: .hubProfile)
        try container.encodeIfPresent(hubLayout, forKey: .hubLayout)
        try container.encodeIfPresent(manifestSettings, forKey: .manifestSettings)
    }
}
