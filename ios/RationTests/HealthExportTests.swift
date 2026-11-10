import XCTest
@testable import Ration

private final class HealthStoreSpy: HealthSampleWriting {
    var authorizationCalls = 0
    var saves: [[HealthQuantitySample]] = []
    var deletes: [[HealthSampleDelete]] = []
    var authorization = "authorized"

    func requestDietaryAuthorization() async -> String {
        authorizationCalls += 1
        return authorization
    }

    func save(_ samples: [HealthQuantitySample]) async {
        saves.append(samples)
    }

    func delete(_ items: [HealthSampleDelete]) async {
        deletes.append(items)
    }
}

final class HealthExportTests: XCTestCase {
    func testSwitchStaysHiddenWhenTheFlagIsOffOrTheAppIsOlder() {
        XCTAssertFalse(
            HealthExportPolicy.switchVisible(flagEnabled: false, appVersion: "1.6.0")
        )
        XCTAssertFalse(
            HealthExportPolicy.switchVisible(flagEnabled: true, appVersion: "1.5.19")
        )
        XCTAssertTrue(
            HealthExportPolicy.switchVisible(flagEnabled: true, appVersion: "1.6.0")
        )
    }

    func testTogglePersistsOnOnlyAfterTheSystemAllowsSharing() {
        XCTAssertEqual(
            HealthExportToggle.deviceStatus(enabled: false, sharingAuthorized: true),
            "off"
        )
        XCTAssertEqual(
            HealthExportToggle.deviceStatus(enabled: true, sharingAuthorized: false),
            "denied"
        )
        XCTAssertEqual(
            HealthExportToggle.deviceStatus(enabled: true, sharingAuthorized: true),
            "on"
        )
    }

    func testMissingConsentDoesNotCallHealthStore() async {
        let store = HealthStoreSpy()
        let result = await HealthExportSession.turnOn(
            intakeConsent: false,
            store: store,
            samples: [sample(version: 1)],
            deletes: [],
            localVersions: [:]
        )
        assertTurn(result, .consentRequired)
        XCTAssertEqual(store.authorizationCalls, 0)
        XCTAssertTrue(store.saves.isEmpty)
        XCTAssertTrue(store.deletes.isEmpty)
    }

    func testDeniedPermissionWritesNothing() async {
        let store = HealthStoreSpy()
        store.authorization = "denied"
        let result = await HealthExportSession.turnOn(
            intakeConsent: true,
            store: store,
            samples: [sample(version: 1)],
            deletes: [HealthSampleDelete(healthSyncId: "sync-1", syncIdentifiers: ["ration:sync-1:dietaryEnergyConsumed"])],
            localVersions: [:]
        )
        assertTurn(result, .denied)
        XCTAssertEqual(store.authorizationCalls, 1)
        XCTAssertTrue(store.saves.isEmpty)
        XCTAssertTrue(store.deletes.isEmpty)
    }

    func testSameVersionDoesNotAddASampleAndAHigherVersionReplaces() {
        let again = HealthExportSession.samplesToWrite(
            [sample(version: 1)],
            localVersions: ["sync-1": 1]
        )
        XCTAssertTrue(again.isEmpty)
        let replaced = HealthExportSession.samplesToWrite(
            [sample(version: 2)],
            localVersions: ["sync-1": 1]
        )
        XCTAssertEqual(replaced.map(\.syncVersion), [2])
        XCTAssertEqual(replaced.map(\.syncIdentifier), ["ration:sync-1:dietaryEnergyConsumed"])
    }

    func testRefusesADailyTotalAndOtherHealthTypes() {
        let refused = HealthExportSession.samplesToWrite(
            [
                sample(version: 1, type: "dailyTotal"),
                sample(version: 1, type: "bodyMass"),
                sample(version: 1, type: "stepCount"),
                sample(version: 1, type: "activeEnergyBurned"),
                sample(version: 1, type: "workout"),
            ],
            localVersions: [:]
        )
        XCTAssertTrue(refused.isEmpty)
    }

    private func sample(version: Int, type: String = "dietaryEnergyConsumed") -> HealthQuantitySample {
        HealthQuantitySample(
            syncIdentifier: "ration:sync-1:\(type)",
            syncVersion: version,
            quantityType: type,
            value: 100,
            healthSyncId: "sync-1"
        )
    }
}

private func assertTurn(_ result: HealthExportTurnOn, _ expected: HealthExportTurnOn) {
    switch (result, expected) {
    case (.consentRequired, .consentRequired), (.denied, .denied):
        break
    case (.written(let left), .written(let right)):
        XCTAssertEqual(left, right)
    default:
        XCTFail("\(result) != \(expected)")
    }
}
