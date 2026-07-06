import Foundation

/// Unit display modes — mirrors `app/lib/unit-display-mode.ts`.
enum UnitDisplayMode: String, CaseIterable, Codable, Sendable, Identifiable {
    case original
    case metric
    case imperial
    case cooking

    var id: String { rawValue }

    var label: String {
        switch self {
        case .original: return "Original"
        case .metric: return "Metric"
        case .imperial: return "Imperial"
        case .cooking: return "Cooking"
        }
    }

    init?(serverValue: String?) {
        guard let serverValue else { return nil }
        self.init(rawValue: serverValue)
    }

    static func resolve(from settings: UserSettings) -> UnitDisplayMode {
        if let mode = UnitDisplayMode(serverValue: settings.unitDisplayMode) {
            return mode
        }
        if let legacy = settings.supplyUnitMode,
           let mode = UnitDisplayMode(rawValue: legacy),
           mode != .original {
            return mode
        }
        return .metric
    }
}

/// Presentation helpers — mirrors `app/lib/present-quantity.ts` display rules.
enum QuantityPresentation {
    private static let epsilon = 1e-6

    /// Snaps float artifacts (e.g. 1.0000000000243 → 1).
    static func snapEpsilon(_ qty: Double) -> Double {
        let rounded = qty.rounded()
        if abs(qty - rounded) < epsilon { return rounded }
        return qty
    }

    /// Formats a numeric quantity for display with sensible precision.
    static func formatNumber(_ qty: Double, unit: String) -> String {
        let snapped = snapEpsilon(qty)
        let isCount = RationUnits.group(for: unit) == .count
        if isCount { return String(Int(snapped.rounded())) }
        if unit == "g", snapped >= 5 { return String(Int(snapped.rounded())) }
        if unit == "oz", snapped < 10 {
            let quarter = (snapped * 4).rounded() / 4
            return quarter.truncatingRemainder(dividingBy: 1) == 0
                ? String(Int(quarter))
                : String(quarter)
        }
        let decimals = snapped >= 10 ? 1 : 2
        return String(format: "%.\(decimals)f", snapped)
    }

    /// Decomposes awkward volume totals (e.g. 17 tbsp → "1 cup + 1 tbsp").
    static func decomposeSubUnits(qty: Double, unit: String) -> String? {
        let snapped = snapEpsilon(qty)
        if unit == "tbsp", snapped >= 16 {
            let cups = Int(snapped / 16)
            let remainder = snapEpsilon(snapped - Double(cups) * 16)
            if cups > 0, remainder > 0 {
                return "\(formatNumber(Double(cups), unit: "cup")) cup + \(formatNumber(remainder, unit: "tbsp")) tbsp"
            }
        }
        if unit == "tsp", snapped >= 3 {
            let tbsp = Int(snapped / 3)
            let remainder = snapEpsilon(snapped - Double(tbsp) * 3)
            if tbsp > 0, remainder > 0 {
                return "\(formatNumber(Double(tbsp), unit: "tbsp")) tbsp + \(formatNumber(remainder, unit: "tsp")) tsp"
            }
        }
        return nil
    }

    /// Full formatted quantity string with unit suffix.
    static func formatQuantity(_ qty: Double, unit: String, approximate: Bool = false) -> String {
        if let decomposed = decomposeSubUnits(qty: qty, unit: unit) {
            return approximate ? "≈\(decomposed)" : decomposed
        }
        let numeric = formatNumber(qty, unit: unit)
        let prefix = approximate ? "≈" : ""
        return "\(prefix)\(numeric) \(unit)"
    }
}
