import Foundation

enum FuelCreateAction: Equatable, CaseIterable {
    case add
    case scan
    case barcode
}

/// Plus-menu copy. The three actions stay available whenever Fuel is visible.
enum FuelMenuCopy {
    static let labels = ["Add Fuel", "Scan to Fuel", "Barcode to Fuel"]

    static func label(for action: FuelCreateAction) -> String {
        switch action {
        case .add: return "Add Fuel"
        case .scan: return "Scan to Fuel"
        case .barcode: return "Barcode to Fuel"
        }
    }

    static func systemImage(for action: FuelCreateAction) -> String {
        switch action {
        case .add: return "plus"
        case .scan: return "camera.viewfinder"
        case .barcode: return "barcode.viewfinder"
        }
    }
}

/// A create tap loads today before it opens anything. A missing day is not a dead tap.
enum FuelMenuRouting {
    static func needsTodayLoad(loadedDate: String?, today: String) -> Bool {
        loadedDate != today
    }

    static func canOpen(loadedDate: String?, today: String) -> Bool {
        loadedDate == today
    }
}

enum FuelActionDecision: Equatable {
    case openForm
    case openCamera
    case openBarcodeCamera
    case openTypedBarcode
    case cameraOff
    case photoLogOff
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
        cameraDenied: Bool,
        photoLogEnabled: Bool = true
    ) -> FuelActionDecision {
        if !isOnline { return .disabledOffline }
        if action == .scan, !photoLogEnabled { return .photoLogOff }
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

/// Fuel delete removes the row after a decoded intake id, or when the server
/// says the row is already gone. Any other failure stays in the list and shows
/// the server message. The daily cap still opens Crew purchase.
enum FuelVoidDecision: Equatable {
    case remove
    case keep(message: String)
    case paywall
}

enum FuelVoidResolution {
    static func decide(intakeId: String?) -> FuelVoidDecision {
        if let intakeId, !intakeId.isEmpty {
            return .remove
        }
        let message = APIError.decoding("diary write missing intakeId").errorDescription
            ?? "Unexpected response from server."
        return .keep(message: message)
    }

    static func decide(_ error: Error) -> FuelVoidDecision {
        guard let api = error as? APIError else {
            if let text = (error as? LocalizedError)?.errorDescription, !text.isEmpty {
                return .keep(message: text)
            }
            return .keep(message: error.localizedDescription)
        }
        if api.statusCode == 404 || api.code == "not_found" {
            return .remove
        }
        if api.code == "fuel_daily_limit" {
            return .paywall
        }
        return .keep(message: api.errorDescription ?? "Something went wrong. Please try again.")
    }
}

/// Photo failures stay specific. The free-day cap is still Crew. A short balance is credits.
enum FuelPhotoFailure: Equatable {
    case crew
    case credits
    case message(String)
}

/// Captions for the Fuel photo poll. The server says `analyzing`, not `processing`.
enum FuelPhotoPollCaption {
    static func message(status: String) -> String? {
        switch status {
        case "queued":
            return "Queued"
        case "analyzing":
            return "Analyzing"
        case "failed":
            return "Photo status: failed."
        default:
            return nil
        }
    }
}

enum FuelPhotoFailureMapping {
    static func decide(_ error: Error) -> FuelPhotoFailure {
        guard let api = error as? APIError else {
            let text = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            return .message(text)
        }
        if api.code == "fuel_daily_limit" { return .crew }
        if api.statusCode == 402 || api.code == "insufficient_credits" { return .credits }
        if api.code == "photo_too_large" {
            return .message(api.errorDescription ?? "Photo must be 3 MiB or smaller.")
        }
        if api.code == "FEATURE_DISABLED" {
            return .message("Photo food log is unavailable.")
        }
        if api.code == "consent_required"
            || api.code == "ai_consent_required"
            || api.code == "nutrition_consent_required" {
            return .message(api.errorDescription ?? "Photo log needs consent.")
        }
        if api.statusCode == 429 {
            return .message(api.errorDescription ?? "Too many requests. Please try again later.")
        }
        return .message(api.errorDescription ?? "That photo was not queued.")
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
