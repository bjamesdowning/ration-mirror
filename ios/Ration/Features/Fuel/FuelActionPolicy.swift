import Foundation

enum FuelCreateAction: Equatable {
    case add
    case scan
    case barcode
}

enum FuelActionDecision: Equatable {
    case openForm
    case openCamera
    case openBarcodeCamera
    case openTypedBarcode
    case cameraOff
    case openPurchase
    case disabledOffline
}

/// Create actions at a full free day open Crew purchase and do not open a camera or a form.
enum FuelActionPolicy {
    static let minimumHitTarget: CGFloat = 44

    static func decide(
        action: FuelCreateAction,
        used: Int,
        limit: Int?,
        isOnline: Bool,
        cameraDenied: Bool
    ) -> FuelActionDecision {
        if !isOnline { return .disabledOffline }
        if let limit, used >= limit { return .openPurchase }
        switch action {
        case .add:
            return .openForm
        case .scan:
            return cameraDenied ? .cameraOff : .openCamera
        case .barcode:
            return cameraDenied ? .openTypedBarcode : .openBarcodeCamera
        }
    }

    static func canEditOrVoidExistingRow() -> Bool { true }

    static func counterLabel(used: Int, limit: Int?) -> String {
        if let limit {
            return "\(used) of \(limit) meals logged"
        }
        return "\(used) logs"
    }
}

enum FuelAccountDeletion {
    static let healthSamplesRemain =
        "Apple Health samples Ration already wrote stay in the Health app until you delete them there. A deletion started on another device cannot remove them."
    static let storedIdentifiersKey = "ration.fuel.healthSyncIdentifiers"

    static func rationIdentifiers(from pending: HealthExportPendingResponse?) -> [String] {
        guard let pending else { return [] }
        var ids = pending.deletes.flatMap(\.syncIdentifiers)
        ids.append(contentsOf: pending.samples.map(\.syncIdentifier))
        return ids.filter { $0.hasPrefix("ration:") }
    }

    static func store(_ identifiers: [String], defaults: UserDefaults = .standard) {
        defaults.set(identifiers, forKey: storedIdentifiersKey)
    }

    static func storedIdentifiers(defaults: UserDefaults = .standard) -> [String] {
        defaults.stringArray(forKey: storedIdentifiersKey) ?? []
    }
}
