import Foundation

// MARK: - Hub

typealias HubProfile = String

struct HubWidgetFilters: Codable, Sendable, Equatable {
    var tags: [String]?
    var slotType: String?
    var domain: String?
    var limit: Int?
    var daySpan: Int?
    var supplyTags: [String]?

    /// Mirrors `HubWidgetFiltersSchema.daySpan` (1 | 3 | 7 | 14) on the web side.
    static let allowedDaySpans = [1, 3, 7, 14]
}

struct HubWidgetLayout: Codable, Sendable, Identifiable, Equatable {
    var id: String
    var order: Int
    var size: String?
    var visible: Bool
    var filters: HubWidgetFilters?
}

struct HubLayoutPayload: Codable, Sendable {
    var widgets: [HubWidgetLayout]
}

struct ManifestPreviewEntry: Codable, Sendable, Identifiable {
    let entryId: String
    let date: String
    let slotType: String
    let mealName: String
    let mealId: String
    let mealType: String?
    let servingsOverride: Int?

    var id: String { entryId }
}

struct ManifestPreviewData: Codable, Sendable {
    let planId: String?
    let entries: [ManifestPreviewEntry]
}

/// `GET /api/mobile/v1/hub`
struct HubResponse: Codable, Sendable {
    let expiringItems: [CargoItem]
    let cargoStats: CargoStats
    let latestSupplyList: SupplyList?
    let manifestPreview: ManifestPreviewData?
    let expirationAlertDays: Int
    let hubProfile: HubProfile?
    let hubLayout: HubLayoutPayload?
    let availableMealTags: [String]
    let availableCargoTags: [String]?
    let cargoTagIndex: [CargoTagIndexItem]?
    let mealMatches: [MealMatch]
    let partialMealMatches: [MealMatch]
    let snackMatches: [MealMatch]
}
