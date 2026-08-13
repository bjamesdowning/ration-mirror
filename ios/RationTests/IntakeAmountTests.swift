import XCTest
@testable import Ration

final class IntakeAmountTests: XCTestCase {
    func testAcceptsQuarterServingAndRejectsBelowMinimum() {
        XCTAssertNotNil(IntakeAmount.resolve(servings: 0.25, gramsPerServing: nil))
        XCTAssertNil(IntakeAmount.resolve(servings: 0, gramsPerServing: nil))
        XCTAssertNil(IntakeAmount.resolve(servings: 0.009, gramsPerServing: nil))
        XCTAssertNil(IntakeAmount.resolve(servings: 101, gramsPerServing: nil))
    }

    func testConvertsGramsUsingRecipeMass() {
        let resolved = IntakeAmount.resolve(
            amount: 180,
            unit: .g,
            gramsPerServing: 310
        )
        XCTAssertEqual(resolved?.loggedUnit, .g)
        XCTAssertEqual(resolved?.loggedAmount ?? -1, 180, accuracy: 0.001)
        XCTAssertEqual(resolved?.servings ?? -1, 180.0 / 310.0, accuracy: 0.0001)
    }

    func testMassUnavailableWithoutGramsPerServing() {
        XCTAssertNil(IntakeAmount.resolve(amount: 180, unit: .g, gramsPerServing: nil))
        XCTAssertFalse(IntakeAmount.canLogByMass(9.9))
        XCTAssertTrue(IntakeAmount.canLogByMass(10))
    }

    func testFormatLoggedUsesStoredUnit() {
        XCTAssertEqual(IntakeAmount.formatLogged(amount: 0.5, unit: .serving), "½ serving")
        XCTAssertEqual(IntakeAmount.formatLogged(amount: 1, unit: .serving), "1 serving")
        XCTAssertEqual(IntakeAmount.formatLogged(amount: 180, unit: .g), "180 g")
    }
}
