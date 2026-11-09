import Foundation

/// Dietary samples only. Weight, steps, workouts, and calories burned are refused.
enum HealthExportPolicy {
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

    /// Hidden unless the child flag is on. iOS below 1.6 stays closed.
    static func switchVisible(flagEnabled: Bool, appVersion: String) -> Bool {
        flagEnabled
            && HubCapturePolicy.choiceVisible(
                fastLogEnabled: true,
                appVersion: appVersion
            )
    }

    /// Missing intake consent does not open HealthKit, even when the switch is on.
    static func mayOpenHealthStore(intakeConsent: Bool, enabled: Bool) -> Bool {
        intakeConsent && enabled
    }
}

struct HealthQuantitySample: Equatable, Sendable {
    var syncIdentifier: String
    var syncVersion: Int
    var quantityType: String
    var value: Double
    var healthSyncId: String
}

struct HealthSampleDelete: Equatable, Sendable {
    var healthSyncId: String
    var syncIdentifiers: [String]
}

protocol HealthSampleWriting: AnyObject {
    func requestDietaryAuthorization() async -> String
    func save(_ samples: [HealthQuantitySample]) async
    func delete(_ items: [HealthSampleDelete]) async
}

enum HealthExportTurnOn {
    case consentRequired
    case denied
    case written(Int)
}

/// Applies a server plan on the device. Same id and version are not saved again.
enum HealthExportSession {
    static func turnOn(
        intakeConsent: Bool,
        store: HealthSampleWriting,
        samples: [HealthQuantitySample],
        deletes: [HealthSampleDelete],
        localVersions: [String: Int]
    ) async -> HealthExportTurnOn {
        guard HealthExportPolicy.mayOpenHealthStore(
            intakeConsent: intakeConsent,
            enabled: true
        ) else {
            return .consentRequired
        }
        let authorization = await store.requestDietaryAuthorization()
        guard authorization == "authorized" else {
            return .denied
        }
        let safe = samplesToWrite(samples, localVersions: localVersions)
        if !safe.isEmpty {
            await store.save(safe)
        }
        let ownDeletes = deletes.filter { item in
            item.syncIdentifiers.allSatisfy { $0.hasPrefix("ration:\(item.healthSyncId):") }
        }
        if !ownDeletes.isEmpty {
            await store.delete(ownDeletes)
        }
        return .written(safe.count)
    }

    static func samplesToWrite(
        _ samples: [HealthQuantitySample],
        localVersions: [String: Int]
    ) -> [HealthQuantitySample] {
        samples.filter { sample in
            HealthExportPolicy.quantityTypes.contains(sample.quantityType)
                && !HealthExportPolicy.refusedTypes.contains(sample.quantityType)
                && sample.syncIdentifier.hasPrefix("ration:\(sample.healthSyncId):")
                && (localVersions[sample.healthSyncId] ?? 0) < sample.syncVersion
        }
    }
}
