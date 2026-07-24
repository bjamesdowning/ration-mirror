import XCTest
@testable import Ration

@MainActor
final class BillingViewModelTests: XCTestCase {
    func testInitialState() {
        let model = BillingViewModel()
        XCTAssertNil(model.status)
        XCTAssertNil(model.purchasingPackageID)
        XCTAssertFalse(model.isLoading)
        XCTAssertFalse(model.isRestoring)
        XCTAssertNil(model.errorMessage)
    }
}
