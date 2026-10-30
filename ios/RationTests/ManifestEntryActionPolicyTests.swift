import XCTest
@testable import Ration

final class ManifestEntryActionPolicyTests: XCTestCase {
    func testShowsCookWhenNotYetCooked() {
        XCTAssertEqual(
            ManifestEntryActionPolicy.primaryAction(isCooked: false, hasPersonalIntake: false),
            .cook
        )
    }

    /// Eat must never be reachable before Cook, even if a stale personal intake were present.
    func testEatIsNeverOfferedBeforeCookRegardlessOfIntake() {
        XCTAssertEqual(
            ManifestEntryActionPolicy.primaryAction(isCooked: false, hasPersonalIntake: true),
            .cook
        )
    }

    func testShowsLogServingAfterCookWithNoIntake() {
        XCTAssertEqual(
            ManifestEntryActionPolicy.primaryAction(isCooked: true, hasPersonalIntake: false),
            .logServing
        )
    }

    func testShowsEditServingWhenIntakeExists() {
        XCTAssertEqual(
            ManifestEntryActionPolicy.primaryAction(isCooked: true, hasPersonalIntake: true),
            .editServing
        )
    }
}
