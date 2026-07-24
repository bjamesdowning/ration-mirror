import Foundation

// MARK: - Galley

struct MealIngredient: Codable, Sendable, Identifiable {
    let id: String
    let mealId: String
    let cargoId: String?
    let resolvedCargoId: String?
    let ingredientName: String
    let quantity: Double
    let unit: String
    let baseQuantity: Double?
    let baseUnit: String?
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
    let tags: [Tag]
    let ingredients: [MealIngredient]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        organizationId = try c.decode(String.self, forKey: .organizationId)
        name = try c.decode(String.self, forKey: .name)
        domain = try c.decode(String.self, forKey: .domain)
        type = try c.decode(String.self, forKey: .type)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        directions = try c.decodeIfPresent(String.self, forKey: .directions)
        equipment = try c.decodeIfPresent([String].self, forKey: .equipment)
        servings = try c.decodeIfPresent(Int.self, forKey: .servings)
        prepTime = try c.decodeIfPresent(Int.self, forKey: .prepTime)
        cookTime = try c.decodeIfPresent(Int.self, forKey: .cookTime)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
        tags = c.decodeTolerantTags(forKey: .tags)
        ingredients = try c.decodeIfPresent([MealIngredient].self, forKey: .ingredients) ?? []
    }

    init(
        id: String,
        organizationId: String,
        name: String,
        domain: String,
        type: String,
        description: String?,
        directions: String?,
        equipment: [String]?,
        servings: Int?,
        prepTime: Int?,
        cookTime: Int?,
        createdAt: Date,
        updatedAt: Date,
        tags: [Tag],
        ingredients: [MealIngredient]
    ) {
        self.id = id
        self.organizationId = organizationId
        self.name = name
        self.domain = domain
        self.type = type
        self.description = description
        self.directions = directions
        self.equipment = equipment
        self.servings = servings
        self.prepTime = prepTime
        self.cookTime = cookTime
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.tags = tags
        self.ingredients = ingredients
    }

    var tagSlugs: [String] { tags.map(\.slug) }
}

/// `GET /api/mobile/v1/meals`
struct MealsResponse: Codable, Sendable {
    let meals: [Meal]
    let total: Int?
    let activeMealIds: [String]?
}

/// `GET /api/mobile/v1/meals/:id`
struct MealDetailResponse: Codable, Sendable {
    let meal: Meal
    let isSelectedForSupply: Bool?
    let servingsOverride: Int?
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
    let total: Int?
}

struct CookMealRequest: Encodable, Sendable {
    var servings: Int?
    var confirmInsufficient: Bool?
}

struct CookMealResponse: Codable, Sendable {
    let cooked: Bool
    let ingredientsDeducted: Int?
    let servings: Int?
    let undoToken: String?
    let requiresConfirmation: Bool?
    let missingIngredients: [MissingIngredientDetail]?
    let partialCook: Bool?
    let skippedIngredients: [MissingIngredientDetail]?
}

struct ToggleActiveResponse: Codable, Sendable {
    let success: Bool?
    let mealId: String?
    let isActive: Bool
    let servingsOverride: Int?
}

struct ToggleCargoRestockResponse: Codable, Sendable {
    let success: Bool?
    let cargoId: String?
    let isActive: Bool
}

struct ClearSelectionsResponse: Codable, Sendable {
    let success: Bool?
    let cleared: Int
}

struct CreateMealIngredientRequest: Codable, Sendable, Equatable {
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
    let index: [CargoTagIndexItem]
}

struct CargoTagIndexItem: Codable, Sendable {
    let id: String
    let name: String
}

struct AIJobSubmitResponse: Codable, Sendable {
    let status: String
    let requestId: String?
}

struct GenerateMealStatusResponse: Decodable, Sendable {
    let status: String
    let recipes: [GeneratedRecipe]?
    let error: String?
}

/// Decoded generate poll recipe — tolerates legacy AI array shapes.
struct GeneratedRecipe: Sendable, Identifiable, Decodable {
    var id: String { name }
    let name: String
    let description: String?
    let directions: String?
    let servings: Int?
    let prepTime: Int?
    let cookTime: Int?
    let ingredients: [CreateMealIngredientRequest]?
    let tags: [String]?

    private struct FlexibleIngredient: Decodable {
        let name: String?
        let ingredientName: String?
        let quantity: Double?
        let unit: String?
        let cargoId: String?
    }

    enum CodingKeys: String, CodingKey {
        case name, description, directions, servings, prepTime, cookTime, ingredients, tags
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        servings = try container.decodeIfPresent(Int.self, forKey: .servings)
        prepTime = try container.decodeIfPresent(Int.self, forKey: .prepTime)
        cookTime = try container.decodeIfPresent(Int.self, forKey: .cookTime)
        tags = try container.decodeIfPresent([String].self, forKey: .tags)

        if let serialized = try? container.decode(String.self, forKey: .directions) {
            directions = serialized
        } else if let steps = try? container.decode([String].self, forKey: .directions) {
            let recipeSteps = steps.enumerated().map { index, text in
                RecipeStep(position: index + 1, text: text)
            }
            directions = DirectionsParser.serializeDirections(recipeSteps)
        } else {
            directions = nil
        }

        if let standard = try? container.decode([CreateMealIngredientRequest].self, forKey: .ingredients) {
            ingredients = standard
        } else if let flexible = try? container.decode([FlexibleIngredient].self, forKey: .ingredients) {
            ingredients = flexible.enumerated().map { index, item in
                CreateMealIngredientRequest(
                    ingredientName: item.ingredientName ?? item.name ?? "",
                    quantity: item.quantity ?? 0,
                    unit: item.unit ?? "unit",
                    cargoId: item.cargoId,
                    orderIndex: index
                )
            }
        } else {
            ingredients = nil
        }
    }
}

struct ExtractedRecipePreview: Codable, Sendable, Equatable {
    let name: String
    let ingredients: [CreateMealIngredientRequest]?

    var ingredientCount: Int { ingredients?.count ?? 0 }
}

struct ImportRecipeStatusResponse: Codable, Sendable {
    let status: String
    let success: Bool?
    let meal: MealSummary?
    let extractedRecipe: ExtractedRecipePreview?
    let sourceUrl: String?
    let code: String?
    let error: String?
    let existingMealId: String?
    let existingMealName: String?
}

struct ImportRecipeConfirmRequest: Encodable, Sendable {
    let requestId: String
}

struct ImportRecipeConfirmResponse: Codable, Sendable {
    let meal: MealSummary
    let code: String?
}

struct CreateProvisionRequest: Encodable, Sendable {
    let name: String
    var domain: String = "food"
    var quantity: Double = 1
    var unit: String = "unit"
    var tags: [String] = []
}

struct CreateProvisionResponse: Codable, Sendable {
    let provision: Meal
}

struct MealSummary: Codable, Sendable {
    let id: String
    let name: String
}

struct ImportRecipeRequest: Encodable, Sendable {
    let url: String
    var pageHtml: String?

    enum CodingKeys: String, CodingKey {
        case url
        case pageHtml
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(url, forKey: .url)
        if let pageHtml, !pageHtml.isEmpty {
            try container.encode(pageHtml, forKey: .pageHtml)
        }
    }
}

struct GenerateMealRequest: Encodable, Sendable {
    var customization: String?
}

