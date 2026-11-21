import XCTest
@testable import Ration

@MainActor
final class HealthExportStoreSpy: HealthSampleWriting {
    enum Event: Equatable {
        case delete(String, [String])
        case save([String])
    }

    var allowed: Set<String> = Set(HealthExportPolicy.quantityTypes)
    var events: [Event] = []
    var authorizationRequests = 0
    /// Any save that contains one of these identifiers throws.
    var failingIdentifiers: Set<String> = []
    var deleteError: Error?

    func requestWriteAuthorization() async throws {
        authorizationRequests += 1
    }

    func authorizedTypes() -> Set<String> { allowed }

    func save(_ samples: [HealthQuantitySample]) async throws {
        if samples.contains(where: { failingIdentifiers.contains($0.syncIdentifier) }) {
            throw NSError(domain: "HealthExportStoreSpy", code: 1)
        }
        events.append(.save(samples.map(\.syncIdentifier)))
    }

    func delete(_ group: HealthDeleteGroup) async throws {
        if let deleteError { throw deleteError }
        events.append(.delete(group.quantityType, group.syncIdentifiers))
    }

    var savedIdentifiers: [String] {
        events.flatMap { event -> [String] in
            if case .save(let ids) = event { return ids }
            return []
        }
    }
}

func healthPendingSample(
    _ healthSyncId: String = "sync-1",
    type: String = "dietaryEnergyConsumed",
    version: Int = 1,
    occurredAt: String = "2026-11-09T08:30:00.000Z",
    value: Double = 100
) -> HealthExportPendingResponse.Sample {
    HealthExportPendingResponse.Sample(
        syncIdentifier: "ration:\(healthSyncId):\(type)",
        syncVersion: version,
        quantityType: type,
        value: value,
        unit: type == "dietaryEnergyConsumed" ? "kcal" : "g",
        healthSyncId: healthSyncId,
        occurredAt: occurredAt,
        foodName: "Yogurt"
    )
}

func healthPendingDelete(
    _ healthSyncId: String,
    types: [String] = HealthExportPolicy.quantityTypes
) -> HealthExportPendingResponse.Delete {
    HealthExportPendingResponse.Delete(
        healthSyncId: healthSyncId,
        syncIdentifiers: types.map { "ration:\(healthSyncId):\($0)" }
    )
}

@MainActor
final class HealthExportTests: XCTestCase {
    func testSwitchStaysHiddenWhenTheFlagIsOffOrTheAppIsBelow1_6_39() {
        XCTAssertFalse(
            HealthExportPolicy.switchVisible(flagEnabled: false, appVersion: "1.6.39")
        )
        XCTAssertFalse(
            HealthExportPolicy.switchVisible(flagEnabled: true, appVersion: "1.6.38")
        )
        XCTAssertFalse(
            HealthExportPolicy.switchVisible(flagEnabled: true, appVersion: "1.5.19")
        )
        XCTAssertTrue(
            HealthExportPolicy.switchVisible(flagEnabled: true, appVersion: "1.6.39")
        )
        XCTAssertTrue(
            HealthExportPolicy.switchVisible(flagEnabled: true, appVersion: "1.7.0")
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

    func testMissingConsentDoesNotOpenHealth() {
        XCTAssertFalse(HealthExportPolicy.mayOpenHealthStore(intakeConsent: false, enabled: true))
        XCTAssertTrue(HealthExportPolicy.mayOpenHealthStore(intakeConsent: true, enabled: true))
    }

    func testParsesServerDatesWithAndWithoutFractionalSeconds() {
        let fractional = HealthExportDates.parse("2026-11-09T08:30:00.000Z")
        let plain = HealthExportDates.parse("2026-11-09T08:30:00Z")
        XCTAssertNotNil(fractional)
        XCTAssertEqual(fractional, plain)
        XCTAssertNil(HealthExportDates.parse("yesterday"))
    }

    func testPlanUsesTheEatenTimeAndSkipsAnUnparseableDate() {
        let plan = HealthExportDevicePlan.make(
            samples: [
                healthPendingSample("sync-1"),
                healthPendingSample("sync-2", occurredAt: "not a date"),
            ],
            deletes: [],
            authorizedTypes: Set(HealthExportPolicy.quantityTypes)
        )
        XCTAssertEqual(plan.saveCount, 1)
        XCTAssertEqual(plan.skipped, 1)
        XCTAssertEqual(
            plan.saveBatches.first?.first?.occurredAt,
            HealthExportDates.parse("2026-11-09T08:30:00.000Z")
        )
    }

    func testRefusesADailyTotalOtherHealthTypesAndForeignIdentifiers() {
        var foreign = healthPendingSample("sync-9")
        foreign = HealthExportPendingResponse.Sample(
            syncIdentifier: "other-app:sync-9:dietaryEnergyConsumed",
            syncVersion: foreign.syncVersion,
            quantityType: foreign.quantityType,
            value: foreign.value,
            unit: foreign.unit,
            healthSyncId: foreign.healthSyncId,
            occurredAt: foreign.occurredAt,
            foodName: foreign.foodName
        )
        let plan = HealthExportDevicePlan.make(
            samples: ["dailyTotal", "bodyMass", "stepCount", "activeEnergyBurned", "workout"]
                .map { healthPendingSample(type: $0) } + [foreign],
            deletes: [
                HealthExportPendingResponse.Delete(
                    healthSyncId: "sync-1",
                    syncIdentifiers: ["ration:sync-2:dietaryEnergyConsumed"]
                ),
            ],
            authorizedTypes: Set(HealthExportPolicy.quantityTypes)
        )
        XCTAssertEqual(plan.saveCount, 0)
        XCTAssertEqual(plan.skipped, 6)
        XCTAssertTrue(plan.deletes.isEmpty)
    }

    func testDeletesNeverIncludeAnIdentifierBeingSaved() {
        let plan = HealthExportDevicePlan.make(
            samples: [healthPendingSample("sync-1", version: 2)],
            deletes: [healthPendingDelete("sync-1"), healthPendingDelete("sync-2", types: ["dietaryFiber"])],
            authorizedTypes: Set(HealthExportPolicy.quantityTypes)
        )
        let deleted = plan.deletes.flatMap(\.syncIdentifiers)
        XCTAssertFalse(deleted.contains("ration:sync-1:dietaryEnergyConsumed"))
        XCTAssertTrue(deleted.contains("ration:sync-1:dietaryProtein"))
        XCTAssertTrue(deleted.contains("ration:sync-2:dietaryFiber"))
        XCTAssertEqual(
            plan.deletes.map(\.quantityType),
            ["dietaryProtein", "dietaryCarbohydrates", "dietaryFatTotal", "dietaryFiber"]
        )
    }

    func testOnlyWritesAndDeletesNutrientsThisIPhoneAllows() {
        let plan = HealthExportDevicePlan.make(
            samples: [
                healthPendingSample("sync-1"),
                healthPendingSample("sync-1", type: "dietaryProtein"),
            ],
            deletes: [healthPendingDelete("sync-2")],
            authorizedTypes: ["dietaryEnergyConsumed"]
        )
        XCTAssertEqual(plan.saveCount, 1)
        XCTAssertEqual(plan.unauthorized, 1)
        XCTAssertEqual(plan.deletes.map(\.quantityType), ["dietaryEnergyConsumed"])
    }

    func testSavesInBatchesOfFifty() {
        let samples = (0..<120).map { healthPendingSample("sync-\($0)") }
        let plan = HealthExportDevicePlan.make(
            samples: samples,
            deletes: [],
            authorizedTypes: Set(HealthExportPolicy.quantityTypes)
        )
        XCTAssertEqual(plan.saveBatches.map(\.count), [50, 50, 20])
    }

    func testRepairDeletesTheSamplesItIsAboutToSaveAgain() {
        let plan = HealthExportDevicePlan.make(
            samples: [healthPendingSample("sync-1")],
            deletes: [],
            authorizedTypes: Set(HealthExportPolicy.quantityTypes),
            repair: true
        )
        XCTAssertEqual(
            plan.repairDeletes,
            [HealthDeleteGroup(
                quantityType: "dietaryEnergyConsumed",
                syncIdentifiers: ["ration:sync-1:dietaryEnergyConsumed"]
            )]
        )
    }

    func testApplierDeletesBeforeSavingAndIsolatesAFailingSample() async throws {
        let store = HealthExportStoreSpy()
        store.failingIdentifiers = ["ration:sync-2:dietaryEnergyConsumed"]
        let plan = HealthExportDevicePlan.make(
            samples: ["sync-1", "sync-2", "sync-3"].map { healthPendingSample($0) },
            deletes: [healthPendingDelete("sync-9", types: ["dietaryEnergyConsumed"])],
            authorizedTypes: Set(HealthExportPolicy.quantityTypes)
        )
        let result = try await HealthExportApplier.apply(plan, store: store)
        XCTAssertEqual(
            store.events.first,
            .delete("dietaryEnergyConsumed", ["ration:sync-9:dietaryEnergyConsumed"])
        )
        XCTAssertEqual(
            store.savedIdentifiers,
            ["ration:sync-1:dietaryEnergyConsumed", "ration:sync-3:dietaryEnergyConsumed"]
        )
        XCTAssertEqual(result.saved, 2)
        XCTAssertEqual(result.failed, 1)
    }

    func testADeleteErrorStopsTheRunSoTheNextSyncRetries() async {
        let store = HealthExportStoreSpy()
        store.deleteError = NSError(domain: "HealthExportStoreSpy", code: 2)
        let plan = HealthExportDevicePlan.make(
            samples: [healthPendingSample("sync-1")],
            deletes: [healthPendingDelete("sync-9")],
            authorizedTypes: Set(HealthExportPolicy.quantityTypes)
        )
        do {
            _ = try await HealthExportApplier.apply(plan, store: store)
            XCTFail("expected the delete error")
        } catch {
            XCTAssertTrue(store.savedIdentifiers.isEmpty)
        }
    }

    func testSinceTrailsTheLastSyncByTenMinutes() {
        XCTAssertEqual(
            HealthExportSince.make(syncedThrough: "2026-11-09T12:00:00.000Z"),
            "2026-11-09T11:50:00.000Z"
        )
        XCTAssertNil(HealthExportSince.make(syncedThrough: nil))
        XCTAssertNil(HealthExportSince.make(syncedThrough: "garbage"))
    }

    func testSettingsCopy() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        XCTAssertEqual(HealthExportStatusText.lastSynced(nil, now: now), "Not synced yet")
        XCTAssertEqual(
            HealthExportStatusText.lastSynced(now.addingTimeInterval(-5), now: now),
            "Last synced just now"
        )
        XCTAssertEqual(
            HealthExportStatusText.exclusionNote(excluded: 0),
            "Not copied: AI estimates until you change the numbers, and meals logged from Galley or Manifest."
        )
        XCTAssertTrue(
            HealthExportStatusText.exclusionNote(excluded: 3).hasSuffix("3 foods in your log weren't copied.")
        )
        XCTAssertEqual(
            HealthExportStatusText.failure(failed: 2, unauthorized: 0, error: nil),
            "Some foods weren't copied to Apple Health. 2 failed."
        )
        XCTAssertNil(HealthExportStatusText.failure(failed: 0, unauthorized: 0, error: nil))
    }
}
