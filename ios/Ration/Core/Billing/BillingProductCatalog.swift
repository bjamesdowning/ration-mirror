import Foundation

/// Display metadata for RevenueCat / App Store product IDs.
struct BillingProductInfo: Equatable, Sendable {
    let displayName: String
    let subtitle: String
    let badge: String?
    let sortOrder: Int
}

enum BillingProductCatalog {
    private static let catalog: [String: BillingProductInfo] = [
        "crew_annual": BillingProductInfo(
            displayName: "Crew Member",
            subtitle: "Annual",
            badge: "Best Value",
            sortOrder: 0
        ),
        "crew_monthly": BillingProductInfo(
            displayName: "Crew Member",
            subtitle: "Monthly",
            badge: nil,
            sortOrder: 1
        ),
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
