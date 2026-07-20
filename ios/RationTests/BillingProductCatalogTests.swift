import XCTest
@testable import Ration

final class BillingProductCatalogTests: XCTestCase {
    func testKnownProductDisplayNames() {
        XCTAssertEqual(BillingProductCatalog.info(for: "credits_xl")?.displayName, "Orbital Stockpile")
        XCTAssertEqual(BillingProductCatalog.info(for: "credits_s")?.subtitle, "12 credits")
        XCTAssertEqual(BillingProductCatalog.info(for: "crew_annual")?.badge, "Best Value")
        XCTAssertEqual(BillingProductCatalog.info(for: "crew_annual")?.subtitle, "Annual")
    }

    func testUnknownProductFallsBack() {
        XCTAssertNil(BillingProductCatalog.info(for: "unknown_sku"))
        XCTAssertEqual(
            BillingProductCatalog.displayName(for: "unknown_sku", fallback: "Fallback"),
            "Fallback"
        )
    }

    func testCreditPackSortOrderAscending() {
        let packages = [
            BillingPackage(id: "xl", title: "XL", priceString: "$22", productIdentifier: "credits_xl"),
            BillingPackage(id: "s", title: "S", priceString: "$1", productIdentifier: "credits_s"),
            BillingPackage(id: "m", title: "M", priceString: "$4", productIdentifier: "credits_m"),
        ]
        let sorted = BillingProductCatalog.sorted(packages).map(\.productIdentifier)
        XCTAssertEqual(sorted, ["credits_s", "credits_m", "credits_xl"])
    }
}
