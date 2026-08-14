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

    func testClampedResolveKeepsValidAmount() {
        let resolved = IntakeAmount.clampedResolve(amount: 1.5, unit: .serving, gramsPerServing: nil)
        XCTAssertEqual(resolved.servings, 1.5, accuracy: 0.0001)
        XCTAssertEqual(resolved.loggedAmount, 1.5, accuracy: 0.0001)
        XCTAssertEqual(resolved.loggedUnit, .serving)
    }

    func testClampedResolveClampsBelowMinimumToServingsMin() {
        let resolved = IntakeAmount.clampedResolve(amount: 0, unit: .serving, gramsPerServing: nil)
        XCTAssertEqual(resolved.servings, IntakeAmount.servingsMin, accuracy: 0.0001)
        XCTAssertEqual(resolved.loggedAmount, IntakeAmount.servingsMin, accuracy: 0.0001)
    }

    func testClampedResolveClampsAboveMaximumToServingsMax() {
        let resolved = IntakeAmount.clampedResolve(amount: 150, unit: .serving, gramsPerServing: nil)
        XCTAssertEqual(resolved.servings, IntakeAmount.servingsMax, accuracy: 0.0001)
        XCTAssertEqual(resolved.loggedAmount, IntakeAmount.servingsMax, accuracy: 0.0001)
    }

    func testClampedStepIncrementsQuarterServing() {
        let resolved = IntakeAmount.clampedStep(
            amount: 1,
            unit: .serving,
            direction: 1,
            gramsPerServing: nil
        )
        XCTAssertEqual(resolved.servings, 1.25, accuracy: 0.0001)
        XCTAssertEqual(resolved.loggedAmount, 1.25, accuracy: 0.0001)
    }

    func testClampedStepDoesNotDropBelowMinimum() {
        let resolved = IntakeAmount.clampedStep(
            amount: 0.25,
            unit: .serving,
            direction: -1,
            gramsPerServing: nil
        )
        XCTAssertEqual(resolved.servings, IntakeAmount.servingsMin, accuracy: 0.0001)
    }

    func testClampedStepDoesNotExceedMaximum() {
        let resolved = IntakeAmount.clampedStep(
            amount: 100,
            unit: .serving,
            direction: 1,
            gramsPerServing: nil
        )
        XCTAssertEqual(resolved.servings, IntakeAmount.servingsMax, accuracy: 0.0001)
    }

    func testClampedStepGramsConvertsBackToServings() {
        let resolved = IntakeAmount.clampedStep(
            amount: 180,
            unit: .g,
            direction: 1,
            gramsPerServing: 310
        )
        XCTAssertEqual(resolved.loggedUnit, .g)
        XCTAssertEqual(resolved.loggedAmount, 190, accuracy: 0.001)
        XCTAssertEqual(resolved.servings, 190.0 / 310.0, accuracy: 0.0001)
    }

    func testMacrosScaleWithSteppedQuantity() {
        let perServingKcal = 500.0
        let perServingProtein = 20.0
        let stepped = IntakeAmount.clampedStep(
            amount: 1,
            unit: .serving,
            direction: 1,
            gramsPerServing: nil
        )
        XCTAssertEqual(perServingKcal * stepped.servings, 625, accuracy: 0.01)
        XCTAssertEqual(perServingProtein * stepped.servings, 25, accuracy: 0.01)
    }
}
