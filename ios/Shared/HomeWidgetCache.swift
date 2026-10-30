import Foundation

struct HomeWidgetSupplyItem: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let name: String
}

struct HomeWidgetEatFood: Codable, Equatable, Sendable, Identifiable {
    let cargoId: String
    let name: String
    let action: String
    let stepQuantity: Double
    let unit: String
    let quantity: Double

    var id: String { cargoId }
    var eatsOneStep: Bool { action == "eat" }

    func withQuantity(_ quantity: Double) -> HomeWidgetEatFood {
        HomeWidgetEatFood(
            cargoId: cargoId,
            name: name,
            action: action,
            stepQuantity: stepQuantity,
            unit: unit,
            quantity: quantity
        )
    }
}

struct HomeWidgetTagChoice: Codable, Equatable, Sendable, Identifiable {
    let slug: String
    let name: String

    var id: String { slug }
}

struct HomeWidgetMeal: Codable, Equatable, Sendable {
    let name: String
    let slotType: String
    let cooked: Bool
}

struct HomeWidgetMacro: Codable, Equatable, Sendable {
    let remaining: Int
    let goal: Int
}

struct HomeWidgetSnapshot: Codable, Equatable, Sendable {
    struct Supply: Codable, Equatable, Sendable {
        var uncheckedCount: Int
        var items: [HomeWidgetSupplyItem]
    }

    struct Eat: Codable, Equatable, Sendable {
        var available: Bool
        var foods: [HomeWidgetEatFood]
        var tagChoices: [HomeWidgetTagChoice]
    }

    struct Today: Codable, Equatable, Sendable {
        var status: String
        var title: String?
        var slotType: String?
        var meals: [HomeWidgetMeal]
        var uncheckedSupplyCount: Int
        var remainingKcal: Int?
        var goalKcal: Int?
        var protein: HomeWidgetMacro?
        var carbs: HomeWidgetMacro?
        var fat: HomeWidgetMacro?
    }

    var supply: Supply
    var eat: Eat
    var today: Today
}

struct WidgetHold: Codable, Equatable, Sendable {
    var id: String
    var name: String
    var until: TimeInterval
    var quantity: Double?
    var unit: String?

    static let duration: TimeInterval = 2

    func isActive(at date: Date) -> Bool {
        until > date.timeIntervalSince1970
    }
}

struct HomeWidgetCache: Codable, Equatable, Sendable {
    var schema: Int
    var state: String
    var snapshot: HomeWidgetSnapshot?
    var eatByTag: [String: HomeWidgetSnapshot.Eat]
    var fetchedAt: TimeInterval?
    var tagFetchedAt: [String: TimeInterval]
    var statusLine: String?
    var inFlightCargoIds: [String]
    var supplyHold: WidgetHold?
    var eatHold: WidgetHold?

    static let currentSchema = 2

    static let placeholder = HomeWidgetCache(
        schema: currentSchema,
        state: "ready",
        snapshot: HomeWidgetSnapshot(
            supply: .init(
                uncheckedCount: 3,
                items: [
                    .init(id: "preview-milk", name: "Milk"),
                    .init(id: "preview-eggs", name: "Eggs"),
                    .init(id: "preview-bread", name: "Bread"),
                ]
            ),
            eat: .init(
                available: true,
                foods: [
                    .init(cargoId: "preview-bread", name: "Bread", action: "eat", stepQuantity: 1, unit: "slice", quantity: 6),
                    .init(cargoId: "preview-apple", name: "Apple", action: "eat", stepQuantity: 1, unit: "unit", quantity: 3),
                ],
                tagChoices: []
            ),
            today: .init(
                status: "planned",
                title: "Lunch",
                slotType: "lunch",
                meals: [
                    .init(name: "Lunch", slotType: "lunch", cooked: false),
                ],
                uncheckedSupplyCount: 3,
                remainingKcal: 640,
                goalKcal: 2000,
                protein: .init(remaining: 82, goal: 140),
                carbs: .init(remaining: 120, goal: 220),
                fat: .init(remaining: 30, goal: 60)
            )
        ),
        eatByTag: [:],
        fetchedAt: nil,
        tagFetchedAt: [:],
        statusLine: nil,
        inFlightCargoIds: [],
        supplyHold: nil,
        eatHold: nil
    )

    var isReady: Bool { state == "ready" && snapshot != nil }

    static func empty(state: String, statusLine: String?) -> HomeWidgetCache {
        HomeWidgetCache(
            schema: currentSchema,
            state: state,
            snapshot: nil,
            eatByTag: [:],
            fetchedAt: Date().timeIntervalSince1970,
            tagFetchedAt: [:],
            statusLine: statusLine,
            inFlightCargoIds: [],
            supplyHold: nil,
            eatHold: nil
        )
    }
}

enum HomeWidgetCacheStore {
    private static let fileName = "home-widget.json"

    static func load() -> HomeWidgetCache? {
        guard let url = fileURL,
              let data = try? Data(contentsOf: url),
              let cache = try? JSONDecoder().decode(HomeWidgetCache.self, from: data),
              cache.schema == HomeWidgetCache.currentSchema else {
            return nil
        }
        return cache
    }

    static func save(_ cache: HomeWidgetCache) {
        guard let url = fileURL,
              let data = try? JSONEncoder().encode(cache) else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    static func clear() {
        guard let url = fileURL else { return }
        try? FileManager.default.removeItem(at: url)
    }

    private static var fileURL: URL? {
        AppGroup.containerURL?.appendingPathComponent(fileName)
    }
}

enum HomeWidgetCopy {
    static func supplyHeadline(uncheckedCount: Int) -> String {
        switch uncheckedCount {
        case 0: return "Nothing to buy"
        case 1: return "1 to buy"
        default: return "\(uncheckedCount) to buy"
        }
    }

    static func todayTitle(status: String, title: String?) -> String {
        switch status {
        case "planned":
            let trimmed = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return trimmed.isEmpty ? "Meal planned" : trimmed
        case "done":
            return "All cooked"
        default:
            return "Nothing planned"
        }
    }

    static func energyLine(remainingKcal: Int?) -> String? {
        guard let remainingKcal else { return nil }
        if remainingKcal >= 0 {
            return "\(remainingKcal) kcal left"
        }
        return "\(-remainingKcal) kcal over"
    }

    static func macroLine(remaining: Int) -> String {
        if remaining >= 0 {
            return "\(remaining) g left"
        }
        return "\(-remaining) g over"
    }

    static func slotLabel(_ slotType: String?) -> String? {
        guard let slotType else { return nil }
        switch slotType.lowercased() {
        case "breakfast": return "Breakfast"
        case "lunch": return "Lunch"
        case "dinner": return "Dinner"
        case "snack": return "Snack"
        default:
            guard !slotType.isEmpty else { return nil }
            return slotType.prefix(1).uppercased() + slotType.dropFirst()
        }
    }

    static func calmLine(for state: String) -> String {
        switch state {
        case "signedOut": return "Open Ration to sign in"
        default: return "Open Ration"
        }
    }

    static func unitPhrase(count: Double, unit: String) -> String {
        let amount: String
        if count.rounded() == count {
            amount = String(Int(count))
        } else {
            amount = String(format: "%g", count)
        }
        return "\(amount) \(plural(unit, count: count))"
    }

    static func eatDetail(quantity: Double, unit: String, step: Double) -> String {
        let take = unitPhrase(count: step, unit: unit)
        guard quantity > 0 else { return take }
        return "\(unitPhrase(count: quantity, unit: unit)) · take \(Int(step.rounded()))"
    }

    static func taggedEmpty(name: String) -> String {
        "Nothing tagged \(name)"
    }

    static func taggedSource(name: String) -> String {
        "Tagged \(name)"
    }

    private static func plural(_ unit: String, count: Double) -> String {
        guard abs(count - 1) > 0.001 else { return unit }
        switch unit {
        case "bunch": return "bunches"
        default:
            if unit.hasSuffix("s") { return unit }
            return unit + "s"
        }
    }
}
