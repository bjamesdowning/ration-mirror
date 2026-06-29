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

/// `GET /api/mobile/v1/session`
struct SessionResponse: Codable, Sendable {
    let user: MobileUser
    let organization: Organization?
    let credits: Int
    let tier: String
    let isTierExpired: Bool
    let organizations: [OrgMembership]

    var isCrewMember: Bool { tier == "crew_member" && !isTierExpired }
}

// MARK: - Dashboard

struct CargoStats: Codable, Sendable {
    let totalItems: Int
    let expiringCount: Int
    let expiredCount: Int
}

/// `GET /api/mobile/v1/dashboard`
struct DashboardResponse: Codable, Sendable {
    struct Meals: Codable, Sendable { let total: Int }
    struct Supply: Codable, Sendable {
        let totalItems: Int
        let uncheckedItems: Int
        let listId: String?
    }
    let cargo: CargoStats
    let meals: Meals
    let supply: Supply
    let credits: Int
    let tier: String
    let isTierExpired: Bool
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
