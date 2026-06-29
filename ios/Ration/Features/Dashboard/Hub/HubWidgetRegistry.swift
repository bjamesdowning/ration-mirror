import Foundation

enum HubWidgetID: String, CaseIterable, Sendable {
    case hubStats = "hub-stats"
    case mealsReady = "meals-ready"
    case mealsPartial = "meals-partial"
    case snacksReady = "snacks-ready"
    case cargoExpiring = "cargo-expiring"
    case supplyPreview = "supply-preview"
    case manifestPreview = "manifest-preview"
}

struct HubWidgetDefinition: Sendable {
    let id: HubWidgetID
    let title: String
    let description: String
    let defaultSize: String
}

/// Widget registry — IDs match web `WIDGET_REGISTRY`.
enum HubWidgetRegistry {
    static let definitions: [HubWidgetID: HubWidgetDefinition] = [
        .hubStats: HubWidgetDefinition(
            id: .hubStats,
            title: "Quick Stats",
            description: "Cargo count, expiring, meals ready, supply count",
            defaultSize: "lg"
        ),
        .mealsReady: HubWidgetDefinition(
            id: .mealsReady,
            title: "Meals Ready",
            description: "Meals you can make with current Cargo",
            defaultSize: "lg"
        ),
        .mealsPartial: HubWidgetDefinition(
            id: .mealsPartial,
            title: "Partial Meals",
            description: "Meals with 50%+ match, missing some ingredients",
            defaultSize: "lg"
        ),
        .snacksReady: HubWidgetDefinition(
            id: .snacksReady,
            title: "Snacks Ready",
            description: "Provisions you can have with current Cargo",
            defaultSize: "lg"
        ),
        .cargoExpiring: HubWidgetDefinition(
            id: .cargoExpiring,
            title: "Expiring Cargo",
            description: "Items expiring within alert window",
            defaultSize: "md"
        ),
        .supplyPreview: HubWidgetDefinition(
            id: .supplyPreview,
            title: "Supply Preview",
            description: "Current Supply List progress",
            defaultSize: "md"
        ),
        .manifestPreview: HubWidgetDefinition(
            id: .manifestPreview,
            title: "Manifest",
            description: "Your upcoming meal plan at a glance",
            defaultSize: "md"
        ),
    ]

    static let fullLayout: [HubWidgetLayout] = [
        HubWidgetLayout(id: HubWidgetID.hubStats.rawValue, order: 0, size: "lg", visible: true),
        HubWidgetLayout(id: HubWidgetID.mealsReady.rawValue, order: 1, size: "lg", visible: true),
        HubWidgetLayout(id: HubWidgetID.mealsPartial.rawValue, order: 2, size: "lg", visible: true),
        HubWidgetLayout(id: HubWidgetID.snacksReady.rawValue, order: 3, size: "lg", visible: true),
        HubWidgetLayout(id: HubWidgetID.cargoExpiring.rawValue, order: 4, size: "md", visible: true),
        HubWidgetLayout(id: HubWidgetID.supplyPreview.rawValue, order: 5, size: "md", visible: true),
        HubWidgetLayout(id: HubWidgetID.manifestPreview.rawValue, order: 6, size: "md", visible: true),
    ]

    static let cookLayout: [HubWidgetLayout] = [
        HubWidgetLayout(id: HubWidgetID.hubStats.rawValue, order: 0, size: "lg", visible: true),
        HubWidgetLayout(id: HubWidgetID.mealsReady.rawValue, order: 1, size: "lg", visible: true),
        HubWidgetLayout(id: HubWidgetID.snacksReady.rawValue, order: 2, size: "lg", visible: true),
        HubWidgetLayout(id: HubWidgetID.cargoExpiring.rawValue, order: 3, size: "md", visible: true),
        HubWidgetLayout(id: HubWidgetID.manifestPreview.rawValue, order: 4, size: "sm", visible: true),
    ]

    static let shopLayout: [HubWidgetLayout] = [
        HubWidgetLayout(id: HubWidgetID.hubStats.rawValue, order: 0, size: "lg", visible: true),
        HubWidgetLayout(id: HubWidgetID.supplyPreview.rawValue, order: 1, size: "md", visible: true),
        HubWidgetLayout(id: HubWidgetID.manifestPreview.rawValue, order: 2, size: "md", visible: true),
        HubWidgetLayout(id: HubWidgetID.mealsPartial.rawValue, order: 3, size: "lg", visible: true),
    ]

    static let minimalLayout: [HubWidgetLayout] = [
        HubWidgetLayout(id: HubWidgetID.hubStats.rawValue, order: 0, size: "lg", visible: true),
        HubWidgetLayout(id: HubWidgetID.mealsReady.rawValue, order: 1, size: "lg", visible: true),
    ]

    static func preset(for profile: HubProfile?) -> [HubWidgetLayout] {
        switch profile ?? "full" {
        case "cook": return cookLayout
        case "shop": return shopLayout
        case "minimal": return minimalLayout
        default: return fullLayout
        }
    }
}
