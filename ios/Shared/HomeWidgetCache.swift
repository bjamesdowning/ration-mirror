import Foundation

struct HomeWidgetSupplyItem: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let name: String
}

struct HomeWidgetAteFood: Codable, Equatable, Sendable, Identifiable {
    let cargoId: String
    let name: String
    let action: String
    let stepQuantity: Double
    let unit: String

    var id: String { cargoId }
    var eatsOneStep: Bool { action == "eat" }
}

struct HomeWidgetSnapshot: Codable, Equatable, Sendable {
    struct Supply: Codable, Equatable, Sendable {
        let uncheckedCount: Int
        let items: [HomeWidgetSupplyItem]
    }

    struct Ate: Codable, Equatable, Sendable {
        let available: Bool
        let foods: [HomeWidgetAteFood]
    }

    struct Today: Codable, Equatable, Sendable {
        let status: String
        let title: String?
        let uncheckedSupplyCount: Int
        let remainingKcal: Int?
        let goalKcal: Int?
    }

    let supply: Supply
    let ate: Ate
    let today: Today
}

struct HomeWidgetCache: Codable, Equatable, Sendable {
    var schema: Int
    var state: String
    var snapshot: HomeWidgetSnapshot?
    var fetchedAt: TimeInterval?
    var statusLine: String?
    var inFlightCargoIds: [String]

    static let currentSchema = 1

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
            ate: .init(
                available: true,
                foods: [
                    .init(cargoId: "preview-bread", name: "Bread", action: "eat", stepQuantity: 1, unit: "slice"),
                    .init(cargoId: "preview-apple", name: "Apple", action: "eat", stepQuantity: 1, unit: "unit"),
                ]
            ),
            today: .init(
                status: "planned",
                title: "Lunch",
                uncheckedSupplyCount: 3,
                remainingKcal: 640,
                goalKcal: 2000
            )
        ),
        fetchedAt: nil,
        statusLine: nil,
        inFlightCargoIds: []
    )

    var isReady: Bool { state == "ready" && snapshot != nil }
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
}
