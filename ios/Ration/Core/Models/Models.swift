import Foundation

// MARK: - Auth

/// `POST /api/mobile/v1/auth/token` response (issueMobileTokenPair).
struct TokenPair: Codable, Sendable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
}

struct MagicLinkResponse: Codable, Sendable {
    let sent: Bool
}

// MARK: - Session / Organization

struct MobileUser: Codable, Sendable, Identifiable {
    let id: String
    let name: String?
    let email: String
    let image: String?
}

struct Organization: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let slug: String?
    let logo: String?
    let credits: Int
}

struct OrgMembership: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let slug: String?
    let logo: String?
    let credits: Int
    let role: String
    let isActive: Bool
}

/// Credit costs for AI features — mirrors `AI_COSTS` from ledger.server.
struct AICosts: Codable, Sendable {
    let scan: Int
    let mealGenerate: Int
    let importUrl: Int
    let organizeCargo: Int
    let mealPlanWeekly: Int

    enum CodingKeys: String, CodingKey {
        case scan = "SCAN"
        case mealGenerate = "MEAL_GENERATE"
        case importUrl = "IMPORT_URL"
        case organizeCargo = "ORGANIZE_CARGO"
        case mealPlanWeekly = "MEAL_PLAN_WEEKLY"
    }
}

/// `GET /api/mobile/v1/session`
struct SessionResponse: Codable, Sendable {
    let user: MobileUser
    let organization: Organization?
    let credits: Int
    let tier: String
    let isTierExpired: Bool
    let organizations: [OrgMembership]
    let aiCosts: AICosts?

    var isCrewMember: Bool { tier == "crew_member" && !isTierExpired }
}

// MARK: - Hub

struct CargoStats: Codable, Sendable {
    let totalItems: Int
    let expiringCount: Int
    let expiredCount: Int
}

// MARK: - Cargo

enum CargoDomain: String, Codable, Sendable, CaseIterable {
    case food, household, alcohol
    var label: String { rawValue.capitalized }
}

struct CargoItem: Codable, Sendable, Identifiable {
    let id: String
    let organizationId: String
    let name: String
    let quantity: Double
    let unit: String
    let tags: [String]
    let domain: String
    let status: String
    let expiresAt: Date?
    let createdAt: Date
    let updatedAt: Date

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        organizationId = try c.decode(String.self, forKey: .organizationId)
        name = try c.decode(String.self, forKey: .name)
        quantity = try c.decode(Double.self, forKey: .quantity)
        unit = try c.decode(String.self, forKey: .unit)
        // `tags` may arrive as a real array or, for legacy double-encoded rows,
        // a JSON/CSV string. Decode tolerantly so the list never hard-fails.
        tags = c.decodeTolerantStringArray(forKey: .tags)
        domain = try c.decode(String.self, forKey: .domain)
        status = try c.decode(String.self, forKey: .status)
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
    }
}

/// `GET /api/mobile/v1/cargo`
struct CargoPage: Codable, Sendable {
    let items: [CargoItem]
    let nextCursor: String?
    let total: Int
}

/// `POST /api/mobile/v1/cargo` request body.
struct CreateCargoRequest: Codable, Sendable {
    let name: String
    let quantity: Double
    let unit: String
    let domain: String
    var tags: [String] = []
    var expiresAt: Date?
}

struct CreateCargoResponse: Codable, Sendable {
    let item: CargoItem
}

// MARK: - Supply

struct SupplyItem: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let quantity: Double
    let unit: String
    let domain: String
    let isPurchased: Bool
}

struct SupplyList: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let items: [SupplyItem]
}

/// `GET /api/mobile/v1/supply`
struct SupplyResponse: Codable, Sendable {
    let list: SupplyList?
}

// MARK: - Galley

struct MealIngredient: Codable, Sendable, Identifiable {
    let id: String
    let mealId: String
    let cargoId: String?
    let ingredientName: String
    let quantity: Double
    let unit: String
    let isOptional: Bool?
    let orderIndex: Int?
}

struct Meal: Codable, Sendable, Identifiable {
    let id: String
    let organizationId: String
    let name: String
    let domain: String
    let type: String
    let description: String?
    let directions: String?
    let equipment: [String]?
    let servings: Int?
    let prepTime: Int?
    let cookTime: Int?
    let createdAt: Date
    let updatedAt: Date
    let tags: [String]
    let ingredients: [MealIngredient]
}

/// `GET /api/mobile/v1/meals`
struct MealsResponse: Codable, Sendable {
    let meals: [Meal]
}

/// `GET /api/mobile/v1/meals/:id`
struct MealDetailResponse: Codable, Sendable {
    let meal: Meal
}

// MARK: - Hub

typealias HubProfile = String

struct HubWidgetFilters: Codable, Sendable, Equatable {
    var tags: [String]?
    var slotType: String?
    var domain: String?
    var limit: Int?
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
    var id: String { "\(date)-\(slotType)-\(mealId)" }
    let date: String
    let slotType: String
    let mealName: String
    let mealId: String
    let mealType: String?
    let servingsOverride: Int?
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
    let mealMatches: [MealMatch]
    let partialMealMatches: [MealMatch]
    let snackMatches: [MealMatch]
}

// MARK: - Settings

struct ManifestSettings: Codable, Sendable {
    var weekStart: String?
    var defaultSlots: [String]?
    var showSnackSlot: Bool?
    var calendarSpan: Int?
}

struct UserSettings: Codable, Sendable {
    var theme: String?
    var supplyUnitMode: String?
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
    var allergens: [String]?
    var aiConsentAt: String?
    var onboardingCompletedAt: String?
    var onboardingStep: Int?
    var expirationAlertDays: Int?
    var hubProfile: HubProfile?
    var hubLayout: HubLayoutPayload?
}

// MARK: - Search

struct SearchResult: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let quantity: Double
    let unit: String
    let domain: String
}

struct SearchResponse: Codable, Sendable {
    let results: [SearchResult]
}

// MARK: - Cargo batch / update

struct BatchCargoItem: Encodable, Sendable {
    let name: String
    let quantity: Double
    let unit: String
    var domain: String = "food"
    var tags: [String] = []
    var expiresAt: Date?
}

struct BatchCargoRequest: Encodable, Sendable {
    let items: [BatchCargoItem]
}

struct BatchCargoResponse: Codable, Sendable {
    let added: Int
    let updated: Int
    let errors: [BatchCargoError]?
}

struct BatchCargoError: Codable, Sendable {
    let name: String
    let error: String
}

struct UpdateCargoRequest: Encodable, Sendable {
    var name: String?
    var quantity: Double?
    var unit: String?
    var domain: String?
    var tags: [String]?
    var expiresAt: Date?
}

struct CargoDetailResponse: Codable, Sendable {
    let item: CargoItem
    let connectedMeals: [ConnectedCargoMeal]?
}

struct ConnectedCargoIngredient: Codable, Sendable, Identifiable {
    let id: String
    let mealId: String
    let ingredientName: String
    let quantity: Double
    let unit: String
    let connectionType: String
}

struct ConnectedCargoMeal: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let type: String
    let tags: [String]
    let connectedIngredients: [ConnectedCargoIngredient]
}

// MARK: - Manifest

struct MealPlanSummary: Codable, Sendable, Identifiable {
    let id: String
    let name: String
}

struct ManifestEntry: Codable, Sendable, Identifiable {
    let id: String
    let planId: String
    let mealId: String
    let date: String
    let slotType: String
    let orderIndex: Int
    let servingsOverride: Int?
    let notes: String?
    let consumedAt: Date?
    let createdAt: Date
    let mealName: String
    let mealServings: Int
    let mealType: String
    let mealPrepTime: Int?
    let mealCookTime: Int?

    var isConsumed: Bool { consumedAt != nil }
}

struct ManifestResponse: Codable, Sendable {
    let plan: MealPlanSummary
    let startDate: String
    let endDate: String
    let entries: [ManifestEntry]
}

struct ManifestEntryCreate: Encodable, Sendable {
    let mealId: String
    let date: String
    let slotType: String
    var servingsOverride: Int?
    var notes: String?
}

struct ManifestEntryCreateResponse: Codable, Sendable {
    let entry: ManifestEntry
}

struct ManifestConsumeRequest: Encodable, Sendable {
    let entryIds: [String]
}

struct ManifestConsumeResponse: Codable, Sendable {
    let consumed: Int
}

// MARK: - Galley match / cook

struct MealMatch: Codable, Sendable, Identifiable {
    var id: String { meal.id }
    let meal: Meal
    let matchPercentage: Double
    let canMake: Bool
    let availableIngredients: [IngredientAvailabilityMatch]?
    let missingIngredients: [MissingIngredientMatch]?
}

struct IngredientAvailabilityMatch: Codable, Sendable, Identifiable {
    var id: String { name }
    let name: String
    let requiredQuantity: Double
    let availableQuantity: Double
    let unit: String
}

struct MissingIngredientMatch: Codable, Sendable, Identifiable {
    var id: String { name }
    let name: String
    let requiredQuantity: Double
    let unit: String
    let isOptional: Bool
}

struct MealMatchResponse: Codable, Sendable {
    let matches: [MealMatch]
}

struct CookMealResponse: Codable, Sendable {
    let cooked: Bool
    let ingredientsDeducted: Int
    let servings: Int
}

struct ToggleActiveResponse: Codable, Sendable {
    let isActive: Bool
}

struct CreateMealIngredientRequest: Codable, Sendable {
    let ingredientName: String
    let quantity: Double
    let unit: String
    var cargoId: String?
    var isOptional: Bool = false
    var orderIndex: Int = 0
}

/// `POST /api/mobile/v1/meals` request body.
struct CreateMealRequest: Encodable, Sendable {
    let name: String
    var domain: String = "food"
    var description: String?
    var directions: String?
    var equipment: [String] = []
    var servings: Int = 1
    var prepTime: Int?
    var cookTime: Int?
    var ingredients: [CreateMealIngredientRequest] = []
    var tags: [String] = []
}

struct CreateMealResponse: Codable, Sendable {
    let meal: Meal
}

struct UpdateMealResponse: Codable, Sendable {
    let meal: Meal
}

struct TagsResponse: Codable, Sendable {
    let tags: [String]
}

struct CargoTagIndexResponse: Codable, Sendable {
    let index: [String: [String]]
}

struct AIJobSubmitResponse: Codable, Sendable {
    let status: String
    let requestId: String?
}

struct GenerateMealStatusResponse: Codable, Sendable {
    let status: String
    let recipes: [GeneratedRecipe]?
    let error: String?
}

struct GeneratedRecipe: Codable, Sendable, Identifiable {
    var id: String { name }
    let name: String
    let description: String?
    let directions: String?
    let servings: Int?
    let prepTime: Int?
    let cookTime: Int?
    let ingredients: [CreateMealIngredientRequest]?
    let tags: [String]?
}

struct ImportRecipeStatusResponse: Codable, Sendable {
    let status: String
    let success: Bool?
    let meal: MealSummary?
    let sourceUrl: String?
    let code: String?
    let error: String?
    let existingMealId: String?
    let existingMealName: String?
}

struct MealSummary: Codable, Sendable {
    let id: String
    let name: String
}

struct ImportRecipeRequest: Encodable, Sendable {
    let url: String
}

struct GenerateMealRequest: Encodable, Sendable {
    var customization: String?
}

struct PlanWeekRequest: Encodable, Sendable {
    let startDate: String
    var days: Int = 7
    var slots: [String] = ["breakfast", "lunch", "dinner"]
    var tag: String?
    var dietaryNote: String?
    var variety: String = "medium"
}

struct PlanWeekScheduleEntry: Codable, Sendable, Identifiable {
    var id: String { "\(date)-\(slotType)-\(mealId)" }
    let date: String
    let slotType: String
    let mealId: String
    let mealName: String
    let notes: String?
}

struct PlanWeekStatusResponse: Codable, Sendable {
    let status: String
    let schedule: [PlanWeekScheduleEntry]?
    let error: String?
}

struct BulkManifestEntry: Encodable, Sendable {
    let mealId: String
    let date: String
    let slotType: String
    var servingsOverride: Int?
    var notes: String?
}

struct BulkManifestRequest: Encodable, Sendable {
    let entries: [BulkManifestEntry]
}

struct BulkManifestResponse: Codable, Sendable {
    let added: Int
}

struct CreateSupplyItemRequest: Encodable, Sendable {
    let name: String
    var quantity: Double = 1
    var unit: String = "unit"
    var domain: String = "food"
}

struct CreateSupplyItemResponse: Codable, Sendable {
    let item: SupplyItem
}

// MARK: - Supply sync / dock

struct SupplySyncResponse: Codable, Sendable {
    let list: SupplyList
    let summary: SupplySyncSummary
}

struct SupplySyncSummary: Codable, Sendable {
    let addedItems: Int?
    let skippedItems: Int?
    let mealsProcessed: Int?
    let totalIngredients: Int?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        addedItems = try c.decodeIfPresent(Int.self, forKey: .addedItems)
            ?? c.decodeIfPresent(Int.self, forKey: .added)
        skippedItems = try c.decodeIfPresent(Int.self, forKey: .skippedItems)
            ?? c.decodeIfPresent(Int.self, forKey: .removed)
        mealsProcessed = try c.decodeIfPresent(Int.self, forKey: .mealsProcessed)
        totalIngredients = try c.decodeIfPresent(Int.self, forKey: .totalIngredients)
            ?? c.decodeIfPresent(Int.self, forKey: .updated)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(addedItems, forKey: .addedItems)
        try c.encodeIfPresent(skippedItems, forKey: .skippedItems)
        try c.encodeIfPresent(mealsProcessed, forKey: .mealsProcessed)
        try c.encodeIfPresent(totalIngredients, forKey: .totalIngredients)
    }

    private enum CodingKeys: String, CodingKey {
        case addedItems, skippedItems, mealsProcessed, totalIngredients
        case added, updated, removed
    }
}

struct AvatarUploadResponse: Codable, Sendable {
    let success: Bool
    let imageUrl: String
}

struct OrgAvatarUploadResponse: Codable, Sendable {
    let success: Bool
    let logoUrl: String
}

struct ShareStatusResponse: Codable, Sendable {
    let shareUrl: String?
    let shareExpiresAt: String?
}

struct ShareCreateResponse: Codable, Sendable {
    let shareToken: String
    let shareUrl: String
    let shareExpiresAt: String
}

struct ShareRevokeResponse: Codable, Sendable {
    let revoked: Bool
}

struct SupplyCompleteRequest: Encodable, Sendable {
    let listId: String
}

struct SupplyCompleteResponse: Codable, Sendable {
    let success: Bool
    let docked: Int
}

struct AccountDeleteResponse: Codable, Sendable {
    let success: Bool
    let deleted: Bool
}

// MARK: - Billing

struct EntitlementInfo: Codable, Sendable {
    let active: Bool
    let expiresAt: String?
    let store: String?
}

struct BillingManagement: Codable, Sendable {
    let store: String?
    let url: String?
}

/// `GET /api/mobile/v1/billing/status`
struct BillingStatus: Codable, Sendable {
    struct Entitlements: Codable, Sendable {
        let crew_member: EntitlementInfo
    }
    let tier: String
    let entitlements: Entitlements
    let management: BillingManagement
    let canPurchaseSubscription: Bool
    let purchaseBlockReason: String?
    let billingUnavailable: Bool
    let credits: Int
}

// MARK: - Scan

/// `POST /api/mobile/v1/scan` — async queue submission.
struct ScanSubmitResponse: Codable, Sendable {
    let requestId: String?
    let status: String?
}

/// `GET /api/mobile/v1/scan/:requestId`
struct ScanStatusResponse: Codable, Sendable {
    let status: String
    let items: [ScanResultItem]?
    let existingInventory: [[String: JSONValue]]?
    let metadata: [String: JSONValue]?
    let error: String?
}

struct ScanResultItem: Codable, Sendable, Identifiable {
    var id: String { "\(name)-\(unit)-\(quantity)" }
    let name: String
    let quantity: Double
    let unit: String
    let domain: String?
    let tags: [String]?
    let expiresAt: String?
}

/// Lightweight dynamic JSON value for scan metadata/result payloads.
enum JSONValue: Codable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case let .bool(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        case let .array(value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

extension KeyedDecodingContainer {
    /// Decodes a `[String]` that may arrive as a real array or, for legacy
    /// double-encoded backend rows, a JSON-encoded or comma-separated string.
    /// Returns `[]` when the key is missing, null, or otherwise unparseable.
    func decodeTolerantStringArray(forKey key: Key) -> [String] {
        if let array = try? decode([String].self, forKey: key) {
            return array
        }
        guard let raw = try? decode(String.self, forKey: key) else {
            return []
        }
        if let data = raw.data(using: .utf8),
           let parsed = try? JSONDecoder().decode([String].self, from: data) {
            return parsed
        }
        return raw
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}
