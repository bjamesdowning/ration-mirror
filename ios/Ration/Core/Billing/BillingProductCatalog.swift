import Foundation

/// Display metadata for RevenueCat / App Store product IDs.
struct BillingProductInfo: Equatable, Sendable {
    let displayName: String
    let subtitle: String
    let badge: String?
    let sortOrder: Int
}

enum BillingProductCatalog {
    /// App Store Connect annual SKU (`crew_annual_1yr`). Legacy `crew_annual` kept as alias.
    private static let crewAnnual = BillingProductInfo(
        displayName: "Annual subscription",
        subtitle: "Crew Member · auto-renews every year",
        badge: "Best Value",
        sortOrder: 0
    )

    private static let crewMonthly = BillingProductInfo(
        displayName: "Monthly subscription",
        subtitle: "Crew Member · auto-renews every month",
        badge: nil,
        sortOrder: 1
    )

    private static let catalog: [String: BillingProductInfo] = [
        "crew_annual_1yr": crewAnnual,
        "crew_annual": crewAnnual,
        "crew_monthly": crewMonthly,
        "credits_s": BillingProductInfo(
            displayName: "Taste Test",
            subtitle: "12 credits",
            badge: nil,
            sortOrder: 10
        ),
        "credits_m": BillingProductInfo(
            displayName: "Supply Run",
            subtitle: "65 credits",
            badge: "Most Popular",
            sortOrder: 11
        ),
        "credits_l": BillingProductInfo(
            displayName: "Mission Crate",
            subtitle: "165 credits",
            badge: nil,
            sortOrder: 12
        ),
        "credits_xl": BillingProductInfo(
            displayName: "Orbital Stockpile",
            subtitle: "550 credits",
            badge: "Best Value",
            sortOrder: 13
        ),
    ]

    static func info(for productIdentifier: String) -> BillingProductInfo? {
        catalog[productIdentifier]
    }

    static func displayName(for productIdentifier: String, fallback: String) -> String {
        catalog[productIdentifier]?.displayName ?? fallback
    }

    static func sortOrder(for productIdentifier: String) -> Int {
        catalog[productIdentifier]?.sortOrder ?? 1000
    }

    static func sorted(_ packages: [BillingPackage]) -> [BillingPackage] {
        packages.sorted {
            sortOrder(for: $0.productIdentifier) < sortOrder(for: $1.productIdentifier)
        }
    }
}
