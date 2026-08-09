import XCTest
@testable import Ration

final class ManifestEntryActionPolicyTests: XCTestCase {
    func testFailsClosedToLegacyConsumeWhenSplitDisabled() {
        let flags = ManifestEntryActionPolicy.Flags(isCookLogSplitEnabled: false, isNutritionManifestEnabled: true)
        XCTAssertEqual(
            ManifestEntryActionPolicy.primaryAction(flags: flags, isCooked: false, hasPersonalIntake: false),
            .legacyConsume
        )
    }

    func testLegacyConsumeShowsNoActionOnceCooked() {
        let flags = ManifestEntryActionPolicy.Flags(isCookLogSplitEnabled: false, isNutritionManifestEnabled: false)
        XCTAssertEqual(
            ManifestEntryActionPolicy.primaryAction(flags: flags, isCooked: true, hasPersonalIntake: false),
            .none
        )
    }

    func testSplitEnabledShowsCookWhenNotYetCooked() {
        let flags = ManifestEntryActionPolicy.Flags(isCookLogSplitEnabled: true, isNutritionManifestEnabled: true)
        XCTAssertEqual(
            ManifestEntryActionPolicy.primaryAction(flags: flags, isCooked: false, hasPersonalIntake: false),
            .cook
        )
    }

    /// Eat must never be reachable before Cook, even if a stale personal intake flag were true.
    func testEatIsNeverOfferedBeforeCookRegardlessOfIntakeFlag() {
        let flags = ManifestEntryActionPolicy.Flags(isCookLogSplitEnabled: true, isNutritionManifestEnabled: true)
        XCTAssertEqual(
            ManifestEntryActionPolicy.primaryAction(flags: flags, isCooked: false, hasPersonalIntake: true),
            .cook
        )
    }

    func testSplitEnabledButManifestOffShowsNoneOnceCooked() {
        let flags = ManifestEntryActionPolicy.Flags(isCookLogSplitEnabled: true, isNutritionManifestEnabled: false)
        XCTAssertEqual(
            ManifestEntryActionPolicy.primaryAction(flags: flags, isCooked: true, hasPersonalIntake: false),
            .none
        )
    }

    func testSplitAndManifestEnabledShowsLogServingAfterCookWithNoIntake() {
        let flags = ManifestEntryActionPolicy.Flags(isCookLogSplitEnabled: true, isNutritionManifestEnabled: true)
        XCTAssertEqual(
            ManifestEntryActionPolicy.primaryAction(flags: flags, isCooked: true, hasPersonalIntake: false),
            .logServing
        )
    }

    func testSplitAndManifestEnabledShowsEditServingWhenIntakeExists() {
        let flags = ManifestEntryActionPolicy.Flags(isCookLogSplitEnabled: true, isNutritionManifestEnabled: true)
        XCTAssertEqual(
            ManifestEntryActionPolicy.primaryAction(flags: flags, isCooked: true, hasPersonalIntake: true),
            .editServing
        )
    }

    func testCanEverLogServingRequiresBothFlags() {
        XCTAssertTrue(
            ManifestEntryActionPolicy.canEverLogServing(
                flags: .init(isCookLogSplitEnabled: true, isNutritionManifestEnabled: true)
            )
        )
        XCTAssertFalse(
            ManifestEntryActionPolicy.canEverLogServing(
                flags: .init(isCookLogSplitEnabled: true, isNutritionManifestEnabled: false)
            )
        )
        XCTAssertFalse(
            ManifestEntryActionPolicy.canEverLogServing(
                flags: .init(isCookLogSplitEnabled: false, isNutritionManifestEnabled: true)
            )
        )
    }

    func testDisabledFlagsDefaultFailsClosed() {
        XCTAssertEqual(ManifestEntryActionPolicy.Flags.disabled.isCookLogSplitEnabled, false)
        XCTAssertEqual(ManifestEntryActionPolicy.Flags.disabled.isNutritionManifestEnabled, false)
        XCTAssertEqual(
            ManifestEntryActionPolicy.primaryAction(flags: .disabled, isCooked: false, hasPersonalIntake: false),
            .legacyConsume
        )
    }
}
