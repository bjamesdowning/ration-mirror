import Foundation
import HealthKit

/// Writes dietary samples on the phone. The server never calls this type.
enum HealthKitExporter {
    static let store = HKHealthStore()

    static func dietaryTypes() -> Set<HKSampleType> {
        Set(quantityTypes().values)
    }

    static func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        try await store.requestAuthorization(toShare: dietaryTypes(), read: dietaryTypes())
    }

    static func sharingAuthorized() -> Bool {
        guard let energy = HKQuantityType.quantityType(forIdentifier: .dietaryEnergyConsumed) else {
            return false
        }
        return store.authorizationStatus(for: energy) == .sharingAuthorized
    }

    /// Saves one sample per nutrient. The same sync id and version are left alone.
    /// A denied or missing authorization returns without saving or deleting.
    static func apply(
        _ pending: HealthExportPendingResponse,
        localVersions: [String: Int] = [:]
    ) async throws {
        guard sharingAuthorized() else { return }
        let planned = pending.samples.map {
            HealthQuantitySample(
                syncIdentifier: $0.syncIdentifier,
                syncVersion: $0.syncVersion,
                quantityType: $0.quantityType,
                value: $0.value,
                healthSyncId: $0.healthSyncId
            )
        }
        let safe = HealthExportSession.samplesToWrite(planned, localVersions: localVersions)
        if !safe.isEmpty {
            let objects = try safe.compactMap { try quantitySample($0, pending: pending) }
            try await store.save(objects)
        }
        for item in pending.deletes where item.syncIdentifiers.allSatisfy({
            $0.hasPrefix("ration:\(item.healthSyncId):")
        }) {
            for identifier in item.syncIdentifiers {
                guard let type = type(forSyncIdentifier: identifier) else { continue }
                let predicate = HKQuery.predicateForObjects(
                    withMetadataKey: HKMetadataKeySyncIdentifier,
                    allowedValues: [identifier]
                )
                try await store.deleteObjects(of: type, predicate: predicate)
            }
        }
    }

    private static func quantityTypes() -> [String: HKQuantityType] {
        let pairs: [(String, HKQuantityTypeIdentifier)] = [
            ("dietaryEnergyConsumed", .dietaryEnergyConsumed),
            ("dietaryProtein", .dietaryProtein),
            ("dietaryCarbohydrates", .dietaryCarbohydrates),
            ("dietaryFatTotal", .dietaryFatTotal),
            ("dietaryFiber", .dietaryFiber),
        ]
        var types: [String: HKQuantityType] = [:]
        for (name, identifier) in pairs {
            if let type = HKQuantityType.quantityType(forIdentifier: identifier) {
                types[name] = type
            }
        }
        return types
    }

    private static func type(forSyncIdentifier identifier: String) -> HKQuantityType? {
        guard let name = identifier.split(separator: ":").last else { return nil }
        return quantityTypes()[String(name)]
    }

    private static func quantitySample(
        _ sample: HealthQuantitySample,
        pending: HealthExportPendingResponse
    ) throws -> HKQuantitySample? {
        guard let type = quantityTypes()[sample.quantityType] else { return nil }
        let source = pending.samples.first { $0.syncIdentifier == sample.syncIdentifier }
        let unit: HKUnit = sample.quantityType == "dietaryEnergyConsumed"
            ? .kilocalorie()
            : .gram()
        let date = ISO8601DateFormatter().date(from: source?.occurredAt ?? "") ?? Date()
        let metadata: [String: Any] = [
            HKMetadataKeySyncIdentifier: sample.syncIdentifier,
            HKMetadataKeySyncVersion: NSNumber(value: sample.syncVersion),
            HKMetadataKeyFoodType: source?.foodName ?? "Food",
        ]
        return HKQuantitySample(
            type: type,
            quantity: HKQuantity(unit: unit, doubleValue: sample.value),
            start: date,
            end: date,
            metadata: metadata
        )
    }
}
