import XCTest
@testable import Ration

final class BillingProductCatalogTests: XCTestCase {
    func testKnownProducts() {
        XCTAssertEqual(BillingProductCatalog.info(for: "credits_xl")?.displayName, "Orbital Stockpile")
        XCTAssertEqual(BillingProductCatalog.info(for: "credits_s")?.subtitle, "12 credits")

        XCTAssertEqual(BillingProductCatalog.info(for: "crew_monthly")?.displayName, "Monthly subscription")
        XCTAssertEqual(
            BillingProductCatalog.info(for: "crew_monthly")?.subtitle,
            "Crew Member · auto-renews every month"
        )

        // App Store Connect product id
        XCTAssertEqual(BillingProductCatalog.info(for: "crew_annual_1yr")?.displayName, "Annual subscription")
        XCTAssertEqual(BillingProductCatalog.info(for: "crew_annual_1yr")?.badge, "Best Value")
        XCTAssertEqual(
            BillingProductCatalog.info(for: "crew_annual_1yr")?.subtitle,
            "Crew Member · auto-renews every year"
        )
        // Legacy / Stripe-side alias
        XCTAssertEqual(
            BillingProductCatalog.info(for: "crew_annual")?.displayName,
            "Annual subscription"
        )
    }

    func testUnknownFallsBack() {
        XCTAssertNil(BillingProductCatalog.info(for: "unknown_sku"))
        XCTAssertEqual(
            BillingProductCatalog.displayName(for: "unknown_sku", fallback: "Fallback"),
            "Fallback"
        )
    }

    func testSortOrderPutsAnnualBeforeMonthlyBeforeCredits() {
        let packages = [
            BillingPackage(id: "c", title: "S", priceString: "$1", productIdentifier: "credits_s"),
            BillingPackage(id: "m", title: "M", priceString: "$2", productIdentifier: "crew_monthly"),
            BillingPackage(id: "a", title: "A", priceString: "$12", productIdentifier: "crew_annual_1yr"),
        ]
        let sorted = BillingProductCatalog.sorted(packages).map(\.productIdentifier)
        XCTAssertEqual(sorted, ["crew_annual_1yr", "crew_monthly", "credits_s"])
    }
}
