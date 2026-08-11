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
    var nutrients: [String]?
    var nutritionDisplay: String?
    var nutritionRange: Int?
    var adherenceNutrient: String?

    /// Mirrors `HubWidgetFiltersSchema.daySpan` (1 | 3 | 7 | 14) on the web side.
    static let allowedDaySpans = [1, 3, 7, 14]
    static let allowedNutritionRanges = [7, 14, 30]
    static let allowedNutrients = ["energy", "protein", "carbs", "fat", "fiber"]
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
    let flightRecorderActivity: FlightRecorderActivity?
    let nutritionToday: NutritionSummary?
    let nutritionTrends: NutritionSummary?

    init(
        expiringItems: [CargoItem],
        cargoStats: CargoStats,
        latestSupplyList: SupplyList?,
        manifestPreview: ManifestPreviewData?,
        expirationAlertDays: Int,
        hubProfile: HubProfile?,
        hubLayout: HubLayoutPayload?,
        availableMealTags: [String],
        availableCargoTags: [String]?,
        cargoTagIndex: [CargoTagIndexItem]?,
        mealMatches: [MealMatch],
        partialMealMatches: [MealMatch],
        snackMatches: [MealMatch],
        flightRecorderActivity: FlightRecorderActivity?,
        nutritionToday: NutritionSummary?,
        nutritionTrends: NutritionSummary?
    ) {
        self.expiringItems = expiringItems
        self.cargoStats = cargoStats
        self.latestSupplyList = latestSupplyList
        self.manifestPreview = manifestPreview
        self.expirationAlertDays = expirationAlertDays
        self.hubProfile = hubProfile
        self.hubLayout = hubLayout
        self.availableMealTags = availableMealTags
        self.availableCargoTags = availableCargoTags
        self.cargoTagIndex = cargoTagIndex
        self.mealMatches = mealMatches
        self.partialMealMatches = partialMealMatches
        self.snackMatches = snackMatches
        self.flightRecorderActivity = flightRecorderActivity
        self.nutritionToday = nutritionToday
        self.nutritionTrends = nutritionTrends
    }

    /// A malformed optional widget must not make the complete Hub unusable.
    /// The Worker validates its response too, but this protects cached and
    /// rollback-era payloads during staggered client/server releases.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        expiringItems = (try? c.decode([CargoItem].self, forKey: .expiringItems)) ?? []
        cargoStats = (try? c.decode(CargoStats.self, forKey: .cargoStats))
            ?? CargoStats(totalItems: 0, expiringCount: 0, expiredCount: 0)
        latestSupplyList = try? c.decode(SupplyList.self, forKey: .latestSupplyList)
        manifestPreview = try? c.decode(ManifestPreviewData.self, forKey: .manifestPreview)
        expirationAlertDays = (try? c.decode(Int.self, forKey: .expirationAlertDays)) ?? 7
        hubProfile = try? c.decode(HubProfile.self, forKey: .hubProfile)
        hubLayout = try? c.decode(HubLayoutPayload.self, forKey: .hubLayout)
        availableMealTags = (try? c.decode([String].self, forKey: .availableMealTags)) ?? []
        availableCargoTags = try? c.decode([String].self, forKey: .availableCargoTags)
        cargoTagIndex = try? c.decode([CargoTagIndexItem].self, forKey: .cargoTagIndex)
        mealMatches = (try? c.decode([MealMatch].self, forKey: .mealMatches)) ?? []
        partialMealMatches = (try? c.decode([MealMatch].self, forKey: .partialMealMatches)) ?? []
        snackMatches = (try? c.decode([MealMatch].self, forKey: .snackMatches)) ?? []
        flightRecorderActivity = try? c.decode(
            FlightRecorderActivity.self,
            forKey: .flightRecorderActivity
        )
        nutritionToday = try? c.decode(NutritionSummary.self, forKey: .nutritionToday)
        nutritionTrends = try? c.decode(NutritionSummary.self, forKey: .nutritionTrends)
    }

    private enum CodingKeys: String, CodingKey {
        case expiringItems, cargoStats, latestSupplyList, manifestPreview
        case expirationAlertDays, hubProfile, hubLayout, availableMealTags
        case availableCargoTags, cargoTagIndex, mealMatches, partialMealMatches
        case snackMatches, flightRecorderActivity, nutritionToday, nutritionTrends
    }
}

struct FlightRecorderTotals: Codable, Sendable {
    let cooked: Int
    let docked: Int
    let expired: Int
    let jettisoned: Int
}

struct FlightRecorderStats: Codable, Sendable {
    let window: String
    let from: String
    let to: String
    let countsByType: [String: Int]
    let totals: FlightRecorderTotals
}

struct FlightRecorderEvent: Codable, Sendable, Identifiable {
    let id: String
    let eventType: String
    let occurredAt: String
    let subjectName: String
    let mealId: String?
    let cargoId: String?
}

struct FlightRecorderActivity: Codable, Sendable {
    let stats: FlightRecorderStats
    let recent: [FlightRecorderEvent]
}
