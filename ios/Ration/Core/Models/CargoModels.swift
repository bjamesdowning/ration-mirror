import Foundation

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

struct CargoItem: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let organizationId: String
    let name: String
    let quantity: Double
    let unit: String
    let baseQuantity: Double
    let baseUnit: String
    let tags: [Tag]
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
        baseQuantity = try c.decodeIfPresent(Double.self, forKey: .baseQuantity) ?? quantity
        baseUnit = try c.decodeIfPresent(String.self, forKey: .baseUnit) ?? unit
        tags = c.decodeTolerantTags(forKey: .tags)
        domain = try c.decode(String.self, forKey: .domain)
        status = try c.decode(String.self, forKey: .status)
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
    }

    /// Optimistic Mark Empty — clears authored and base quantity, keeps the row.
    func withZeroQuantity() -> CargoItem {
        CargoItem(
            id: id,
            organizationId: organizationId,
            name: name,
            quantity: 0,
            unit: unit,
            baseQuantity: 0,
            baseUnit: baseUnit,
            tags: tags,
            domain: domain,
            status: status,
            expiresAt: expiresAt,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }

    init(
        id: String,
        organizationId: String,
        name: String,
        quantity: Double,
        unit: String,
        baseQuantity: Double,
        baseUnit: String,
        tags: [Tag],
        domain: String,
        status: String,
        expiresAt: Date?,
        createdAt: Date,
        updatedAt: Date
    ) {
        self.id = id
        self.organizationId = organizationId
        self.name = name
        self.quantity = quantity
        self.unit = unit
        self.baseQuantity = baseQuantity
        self.baseUnit = baseUnit
        self.tags = tags
        self.domain = domain
        self.status = status
        self.expiresAt = expiresAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var tagSlugs: [String] { tags.map(\.slug) }
}

/// `GET /api/mobile/v1/cargo`
struct CargoPage: Codable, Sendable {
    let items: [CargoItem]
    let nextCursor: String?
    let total: Int
    let activeCargoIds: [String]?
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

// MARK: - Search

struct SearchResult: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let quantity: Double
    let unit: String
    let baseQuantity: Double?
    let baseUnit: String?
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

/// Three-state date for partial PATCH: omit (leave unchanged), clear (JSON null), or set.
enum OptionalDateUpdate: Sendable {
    case omit
    case clear
    case set(Date)
}

struct UpdateCargoRequest: Encodable, Sendable {
    var name: String?
    var quantity: Double?
    var unit: String?
    var domain: String?
    var tags: [String]?
    /// Defaults to `.omit` so quantity-only updates do not clear expiry.
    var expiresAt: OptionalDateUpdate = .omit

    enum CodingKeys: String, CodingKey {
        case name, quantity, unit, domain, tags, expiresAt
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(quantity, forKey: .quantity)
        try container.encodeIfPresent(unit, forKey: .unit)
        try container.encodeIfPresent(domain, forKey: .domain)
        try container.encodeIfPresent(tags, forKey: .tags)
        switch expiresAt {
        case .omit:
            break
        case .clear:
            try container.encodeNil(forKey: .expiresAt)
        case let .set(date):
            try container.encode(date, forKey: .expiresAt)
        }
    }
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
    let isOptional: Bool?
    let orderIndex: Int?
}

struct ConnectedCargoMeal: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let type: String
    let description: String?
    let tags: [Tag]
    let connectedIngredients: [ConnectedCargoIngredient]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        type = try c.decode(String.self, forKey: .type)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        tags = c.decodeTolerantTags(forKey: .tags)
        connectedIngredients = try c.decode([ConnectedCargoIngredient].self, forKey: .connectedIngredients)
    }

    init(
        id: String,
        name: String,
        type: String,
        description: String?,
        tags: [Tag],
        connectedIngredients: [ConnectedCargoIngredient]
    ) {
        self.id = id
        self.name = name
        self.type = type
        self.description = description
        self.tags = tags
        self.connectedIngredients = connectedIngredients
    }
}
