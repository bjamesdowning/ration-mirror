import Foundation

/// Dietary samples only. Weight, steps, workouts, and calories burned are refused.
enum HealthExportPolicy {
    /// iOS below this version could not keep Health current; the server fails it closed.
    static let minimumAppVersion = "1.6.39"

    /// Which server export rule this build last fully synced. 2 (1.6.41):
    /// every usable Fuel log, AI estimates marked. A lower stored value forces
    /// one full sync so older logs are written once.
    static let exportRulesVersion = 2

    /// HealthKit metadata key on an AI-estimate sample. Not an HK key, so
    /// HealthKit stores it as custom metadata.
    static let estimateMetadataKey = "ration.estimate"

    /// Ration's own metadata on a sample. Only an AI estimate carries any.
    static func customMetadata(estimate: Bool) -> [String: Bool] {
        estimate ? [estimateMetadataKey: true] : [:]
    }

    static let quantityTypes = [
        "dietaryEnergyConsumed",
        "dietaryProtein",
        "dietaryCarbohydrates",
        "dietaryFatTotal",
        "dietaryFiber",
    ]

    static let refusedTypes: Set<String> = [
        "dailyTotal",
        "bodyMass",
        "stepCount",
        "activeEnergyBurned",
        "workout",
    ]

    /// Hidden unless the child flag is on. iOS below 1.6.39 stays closed.
    static func switchVisible(flagEnabled: Bool, appVersion: String) -> Bool {
        flagEnabled && HubCapturePolicy.isAtLeast(appVersion, minimumAppVersion)
    }

    /// Missing intake consent does not open HealthKit, even when the switch is on.
    static func mayOpenHealthStore(intakeConsent: Bool, enabled: Bool) -> Bool {
        intakeConsent && enabled
    }

    /// A Ration sync identifier is `ration:<healthSyncId>:<quantityType>`.
    static func ownsIdentifier(_ identifier: String, healthSyncId: String) -> Bool {
        identifier.hasPrefix("ration:\(healthSyncId):")
    }

    static func quantityType(ofIdentifier identifier: String) -> String? {
        guard identifier.hasPrefix("ration:"),
              let last = identifier.split(separator: ":").last
        else { return nil }
        let type = String(last)
        return quantityTypes.contains(type) ? type : nil
    }
}

/// Device status stored after the system permission sheet. This does not write samples.
enum HealthExportToggle {
    static func deviceStatus(enabled: Bool, sharingAuthorized: Bool) -> String {
        if !enabled { return "off" }
        return sharingAuthorized ? "on" : "denied"
    }
}

struct HealthQuantitySample: Equatable, Sendable {
    var syncIdentifier: String
    var syncVersion: Int
    var quantityType: String
    var value: Double
    var healthSyncId: String
    var occurredAt: Date
    var foodName: String
    /// True for an AI estimate. Written as `ration.estimate` metadata.
    var estimate: Bool = false
}

struct HealthSampleDelete: Equatable, Sendable {
    var healthSyncId: String
    var syncIdentifiers: [String]
}

/// One HealthKit delete call: every identifier shares one quantity type.
struct HealthDeleteGroup: Equatable, Sendable {
    var quantityType: String
    var syncIdentifiers: [String]
}

/// The only HealthKit surface the exporter uses. Production is `HealthKitExporter`.
@MainActor
protocol HealthSampleWriting: AnyObject {
    /// Asks for write (share) permission only. Ration never reads Health.
    func requestWriteAuthorization() async throws
    /// Quantity type names this iPhone currently lets Ration write.
    func authorizedTypes() -> Set<String>
    func save(_ samples: [HealthQuantitySample]) async throws
    func delete(_ group: HealthDeleteGroup) async throws
}

enum HealthExportDates {
    /// The server sends `2026-11-09T12:00:00.000Z`. Without fractional seconds
    /// ISO8601DateFormatter fails, so try both. Nil means skip the sample.
    static func parse(_ raw: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: raw) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: raw)
    }

    static func format(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}

/// What the iPhone does with one pending response. Pure, so tests cover the shipped path.
struct HealthExportDevicePlan: Equatable, Sendable {
    static let saveBatchSize = 50
    static let deleteChunkSize = 200

    /// One-time repair deletes, run first so samples saved at the wrong time move.
    var repairDeletes: [HealthDeleteGroup]
    /// Removals and cleared nutrients. Never includes an identifier being saved.
    var deletes: [HealthDeleteGroup]
    var saveBatches: [[HealthQuantitySample]]
    /// Samples for a nutrient the person turned off in Health.
    var unauthorized: Int
    /// Samples refused (not a Ration dietary type, foreign id, or bad date).
    var skipped: Int

    static func make(
        samples: [HealthExportPendingResponse.Sample],
        deletes: [HealthExportPendingResponse.Delete],
        authorizedTypes: Set<String>,
        repair: Bool = false
    ) -> HealthExportDevicePlan {
        var writes: [HealthQuantitySample] = []
        var unauthorized = 0
        var skipped = 0
        var seen = Set<String>()
        for sample in samples {
            guard HealthExportPolicy.quantityTypes.contains(sample.quantityType),
                  !HealthExportPolicy.refusedTypes.contains(sample.quantityType),
                  HealthExportPolicy.ownsIdentifier(
                      sample.syncIdentifier,
                      healthSyncId: sample.healthSyncId
                  ),
                  sample.syncIdentifier.hasSuffix(":\(sample.quantityType)"),
                  sample.value.isFinite,
                  sample.value >= 0,
                  let occurredAt = HealthExportDates.parse(sample.occurredAt)
            else {
                skipped += 1
                continue
            }
            guard authorizedTypes.contains(sample.quantityType) else {
                unauthorized += 1
                continue
            }
            guard seen.insert(sample.syncIdentifier).inserted else { continue }
            writes.append(
                HealthQuantitySample(
                    syncIdentifier: sample.syncIdentifier,
                    syncVersion: sample.syncVersion,
                    quantityType: sample.quantityType,
                    value: sample.value,
                    healthSyncId: sample.healthSyncId,
                    occurredAt: occurredAt,
                    foodName: sample.foodName,
                    estimate: sample.estimate == true
                )
            )
        }
        let writeIds = Set(writes.map(\.syncIdentifier))
        var deleteIds: [String] = []
        for item in deletes {
            for identifier in item.syncIdentifiers
            where HealthExportPolicy.ownsIdentifier(identifier, healthSyncId: item.healthSyncId)
                && !writeIds.contains(identifier)
            {
                deleteIds.append(identifier)
            }
        }
        return HealthExportDevicePlan(
            repairDeletes: repair
                ? group(writes.map(\.syncIdentifier), authorizedTypes: authorizedTypes)
                : [],
            deletes: group(deleteIds, authorizedTypes: authorizedTypes),
            saveBatches: stride(from: 0, to: writes.count, by: saveBatchSize).map {
                Array(writes[$0..<min($0 + saveBatchSize, writes.count)])
            },
            unauthorized: unauthorized,
            skipped: skipped
        )
    }

    /// Groups by quantity type in a stable order. A type Ration may not write
    /// cannot be deleted either, so it is left for a later sync.
    static func group(
        _ identifiers: [String],
        authorizedTypes: Set<String>
    ) -> [HealthDeleteGroup] {
        var byType: [String: [String]] = [:]
        var seen = Set<String>()
        for identifier in identifiers where seen.insert(identifier).inserted {
            guard let type = HealthExportPolicy.quantityType(ofIdentifier: identifier),
                  authorizedTypes.contains(type)
            else { continue }
            byType[type, default: []].append(identifier)
        }
        var groups: [HealthDeleteGroup] = []
        for type in HealthExportPolicy.quantityTypes {
            guard let ids = byType[type] else { continue }
            for start in stride(from: 0, to: ids.count, by: deleteChunkSize) {
                groups.append(
                    HealthDeleteGroup(
                        quantityType: type,
                        syncIdentifiers: Array(ids[start..<min(start + deleteChunkSize, ids.count)])
                    )
                )
            }
        }
        return groups
    }

    var saveCount: Int { saveBatches.reduce(0) { $0 + $1.count } }
}

struct HealthExportApplyResult: Equatable, Sendable {
    var saved = 0
    var deletedGroups = 0
    var failed = 0
    var unauthorized = 0
    var skipped = 0
}

/// Runs a device plan: repair deletes, then deletes, then saves in batches.
/// A delete error stops the run so the next sync retries it. A failed save
/// batch is retried one sample at a time so one bad sample does not block the rest.
@MainActor
enum HealthExportApplier {
    static func apply(
        _ plan: HealthExportDevicePlan,
        store: HealthSampleWriting
    ) async throws -> HealthExportApplyResult {
        var result = HealthExportApplyResult(
            unauthorized: plan.unauthorized,
            skipped: plan.skipped
        )
        for group in plan.repairDeletes + plan.deletes {
            try await store.delete(group)
            result.deletedGroups += 1
        }
        for batch in plan.saveBatches {
            do {
                try await store.save(batch)
                result.saved += batch.count
            } catch {
                for sample in batch {
                    do {
                        try await store.save([sample])
                        result.saved += 1
                    } catch {
                        result.failed += 1
                    }
                }
            }
        }
        return result
    }
}

/// Whether a sync must pull everything rather than changes since the last sync.
enum HealthExportFullPull {
    static func required(
        forced: Bool,
        repair: Bool,
        syncedThrough: String?,
        storedRulesVersion: Int
    ) -> Bool {
        forced || repair || syncedThrough == nil
            || storedRulesVersion < HealthExportPolicy.exportRulesVersion
    }
}

/// `since` sent to the server: the last `syncedThrough` minus a margin, so a
/// slow commit or a skewed clock is picked up again. Re-sending is harmless.
enum HealthExportSince {
    static let margin: TimeInterval = 10 * 60

    static func make(syncedThrough: String?) -> String? {
        guard let syncedThrough, let date = HealthExportDates.parse(syncedThrough) else {
            return nil
        }
        return HealthExportDates.format(date.addingTimeInterval(-margin))
    }
}
