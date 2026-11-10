import XCTest
@testable import Ration

final class FuelActionPolicyTests: XCTestCase {
    func testCapOpensPurchaseAndKeepsEdit() {
        for action in [FuelCreateAction.add, .scan, .barcode] {
            XCTAssertEqual(
                FuelActionPolicy.decide(
                    action: action,
                    used: 3,
                    limit: 3,
                    isOnline: true,
                    cameraDenied: true
                ),
                .openPurchase
            )
        }
        XCTAssertTrue(FuelActionPolicy.canEditOrVoidExistingRow())
        XCTAssertEqual(FuelActionPolicy.counterLabel(used: 3, limit: 3), "3 of 3 meals logged")
        XCTAssertGreaterThanOrEqual(FuelActionPolicy.minimumHitTarget, 44)
    }

    func testOfflineDisablesCreates() {
        XCTAssertEqual(
            FuelActionPolicy.decide(
                action: .add,
                used: 0,
                limit: 3,
                isOnline: false,
                cameraDenied: false
            ),
            .disabledOffline
        )
    }

    func testCameraDeniedFallsBackOnlyUnderTheCap() {
        XCTAssertEqual(
            FuelActionPolicy.decide(
                action: .barcode,
                used: 2,
                limit: 3,
                isOnline: true,
                cameraDenied: true
            ),
            .openTypedBarcode
        )
        XCTAssertEqual(
            FuelActionPolicy.decide(
                action: .scan,
                used: 1,
                limit: 3,
                isOnline: true,
                cameraDenied: true
            ),
            .cameraOff
        )
    }

    func testCrewHasNoCapLabelCeiling() {
        XCTAssertEqual(
            FuelActionPolicy.decide(
                action: .add,
                used: 9,
                limit: nil,
                isOnline: true,
                cameraDenied: false
            ),
            .openForm
        )
    }
}
