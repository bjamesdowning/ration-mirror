import Foundation
import HealthKit

/// Writes and deletes Ration's dietary samples on the phone. The server never calls this type.
/// Ration asks for write (share) permission only and never reads Health.
@MainActor
final class HealthKitExporter: HealthSampleWriting {
    static let shared = HealthKitExporter()

    private let store = HKHealthStore()

    static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestWriteAuthorization() async throws {
        guard Self.isAvailable else { return }
        let shareTypes = Set<HKSampleType>(Self.types().values.map { $0 as HKSampleType })
        try await store.requestAuthorization(toShare: shareTypes, read: [])
    }

    /// HealthKit reports write status per type, so a person can allow calories
    /// and deny fiber. Only allowed types are written or deleted.
    func authorizedTypes() -> Set<String> {
        guard Self.isAvailable else { return [] }
        var allowed = Set<String>()
        for (name, type) in Self.types() where store.authorizationStatus(for: type) == .sharingAuthorized {
            allowed.insert(name)
        }
        return allowed
    }

    func save(_ samples: [HealthQuantitySample]) async throws {
        let objects = samples.compactMap(Self.quantitySample)
        guard !objects.isEmpty else { return }
        try await store.save(objects)
    }

    /// Deletes only samples this app wrote with these sync identifiers.
    func delete(_ group: HealthDeleteGroup) async throws {
        guard let type = Self.types()[group.quantityType], !group.syncIdentifiers.isEmpty else {
            return
        }
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
            HKQuery.predicateForObjects(from: HKSource.default()),
            HKQuery.predicateForObjects(
                withMetadataKey: HKMetadataKeySyncIdentifier,
                allowedValues: group.syncIdentifiers
            ),
        ])
        do {
            _ = try await store.deleteObjects(of: type, predicate: predicate)
        } catch let error as HKError where error.code == .errorNoData {
            // Nothing matched: already removed, or never written on this iPhone.
        }
    }

    private static func types() -> [String: HKQuantityType] {
        let pairs: [(String, HKQuantityTypeIdentifier)] = [
            ("dietaryEnergyConsumed", .dietaryEnergyConsumed),
            ("dietaryProtein", .dietaryProtein),
            ("dietaryCarbohydrates", .dietaryCarbohydrates),
            ("dietaryFatTotal", .dietaryFatTotal),
            ("dietaryFiber", .dietaryFiber),
        ]
        var types: [String: HKQuantityType] = [:]
        for (name, identifier) in pairs {
            types[name] = HKQuantityType(identifier)
        }
        return types
    }

    private static func quantitySample(_ sample: HealthQuantitySample) -> HKQuantitySample? {
        guard let type = types()[sample.quantityType] else { return nil }
        let unit: HKUnit = sample.quantityType == "dietaryEnergyConsumed"
            ? .kilocalorie()
            : .gram()
        var metadata: [String: Any] = [
            HKMetadataKeySyncIdentifier: sample.syncIdentifier,
            HKMetadataKeySyncVersion: NSNumber(value: sample.syncVersion),
            HKMetadataKeyFoodType: sample.foodName,
        ]
        for (key, value) in HealthExportPolicy.customMetadata(estimate: sample.estimate) {
            metadata[key] = NSNumber(value: value)
        }
        return HKQuantitySample(
            type: type,
            quantity: HKQuantity(unit: unit, doubleValue: sample.value),
            start: sample.occurredAt,
            end: sample.occurredAt,
            metadata: metadata
        )
    }
}
