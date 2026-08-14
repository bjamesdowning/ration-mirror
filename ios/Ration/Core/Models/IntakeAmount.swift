import Foundation

enum IntakeLoggedUnit: String, Codable, Sendable, CaseIterable {
    case serving
    case g
    case oz
}

enum IntakeAmount {
    static let servingsMin = 0.01
    static let servingsMax = 100.0
    static let servingsDecimals = 4
    static let gramsDecimals = 1
    static let ozDecimals = 2
    static let minGramsPerServingForMass = 10.0
    /// Matches `app/lib/units.ts` `OZ_PER_G = 1/28.3495`.
    static let gramsPerOunce = 28.3495

    struct Preset: Sendable {
        let value: Double
        let label: String
    }

    static let presets: [Preset] = [
        Preset(value: 0.25, label: "¼"),
        Preset(value: 1.0 / 3.0, label: "⅓"),
        Preset(value: 0.5, label: "½"),
        Preset(value: 0.75, label: "¾"),
        Preset(value: 1, label: "1"),
        Preset(value: 1.5, label: "1½"),
        Preset(value: 2, label: "2"),
    ]

    static func roundTo(_ value: Double, decimals: Int) -> Double {
        let factor = pow(10.0, Double(decimals))
        return (value * factor).rounded() / factor
    }

    static func normalizeServings(_ value: Double) -> Double {
        roundTo(value, decimals: servingsDecimals)
    }

    static func isServingsInRange(_ value: Double) -> Bool {
        value.isFinite && value >= servingsMin && value <= servingsMax
    }

    static func canLogByMass(_ gramsPerServing: Double?) -> Bool {
        guard let gramsPerServing, gramsPerServing.isFinite else { return false }
        return gramsPerServing >= minGramsPerServingForMass
    }

    static func massUnit(forDisplayMode mode: UnitDisplayMode) -> IntakeLoggedUnit {
        mode == .imperial ? .oz : .g
    }

    static func grams(fromAmount amount: Double, unit: IntakeLoggedUnit) -> Double? {
        switch unit {
        case .serving: return nil
        case .g: return amount
        case .oz: return amount * gramsPerOunce
        }
    }

    static func amount(fromServings servings: Double, unit: IntakeLoggedUnit, gramsPerServing: Double?) -> Double? {
        guard servings.isFinite, servings > 0 else { return nil }
        if unit == .serving { return normalizeServings(servings) }
        guard canLogByMass(gramsPerServing), let gramsPerServing else { return nil }
        let grams = servings * gramsPerServing
        if unit == .g { return roundTo(grams, decimals: gramsDecimals) }
        return roundTo(grams / gramsPerOunce, decimals: ozDecimals)
    }

    static func step(for unit: IntakeLoggedUnit) -> Double {
        switch unit {
        case .serving: return 0.25
        case .g: return 10
        case .oz: return 0.5
        }
    }

    static func roundLoggedAmount(_ amount: Double, unit: IntakeLoggedUnit) -> Double {
        switch unit {
        case .g: return roundTo(amount, decimals: gramsDecimals)
        case .oz: return roundTo(amount, decimals: ozDecimals)
        case .serving: return normalizeServings(amount)
        }
    }

    /// Always returns a value inside servings bounds (0.01...100). Out-of-range
    /// input clamps to the nearest valid bound instead of failing.
    static func clampedResolve(
        amount: Double,
        unit: IntakeLoggedUnit,
        gramsPerServing: Double?
    ) -> (servings: Double, loggedAmount: Double, loggedUnit: IntakeLoggedUnit) {
        if let resolved = resolve(amount: amount, unit: unit, gramsPerServing: gramsPerServing) {
            return resolved
        }
        let rawServings: Double
        if unit == .serving {
            rawServings = amount
        } else if canLogByMass(gramsPerServing),
                  let gramsPerServing,
                  let grams = grams(fromAmount: max(amount, 0), unit: unit),
                  gramsPerServing > 0
        {
            rawServings = grams / gramsPerServing
        } else {
            rawServings = amount
        }
        let finite = rawServings.isFinite && rawServings > 0 ? rawServings : servingsMin
        let clampedServings = min(max(normalizeServings(finite), servingsMin), servingsMax)
        let loggedUnit: IntakeLoggedUnit =
            unit == .serving || canLogByMass(gramsPerServing) ? unit : .serving
        if let logged = self.amount(
            fromServings: clampedServings,
            unit: loggedUnit,
            gramsPerServing: gramsPerServing
        ), let resolved = resolve(
            amount: logged,
            unit: loggedUnit,
            gramsPerServing: gramsPerServing
        ) {
            return resolved
        }
        return (clampedServings, clampedServings, .serving)
    }

    /// Step `direction` (−1 or +1) by the unit's increment, clamped to servings bounds.
    static func clampedStep(
        amount: Double,
        unit: IntakeLoggedUnit,
        direction: Int,
        gramsPerServing: Double?
    ) -> (servings: Double, loggedAmount: Double, loggedUnit: IntakeLoggedUnit) {
        let dir = direction >= 0 ? 1.0 : -1.0
        let proposed = roundLoggedAmount(amount + dir * step(for: unit), unit: unit)
        return clampedResolve(amount: proposed, unit: unit, gramsPerServing: gramsPerServing)
    }

    static func formatServings(_ value: Double) -> String {
        let snapped = normalizeServings(value)
        for preset in presets where abs(snapped - preset.value) < 0.005 {
            return preset.label
        }
        if snapped == snapped.rounded() {
            return String(Int(snapped.rounded()))
        }
        var text = String(format: "%.\(servingsDecimals)f", snapped)
        while text.last == "0" { text.removeLast() }
        if text.last == "." { text.removeLast() }
        return text
    }

    static func formatLogged(amount: Double, unit: IntakeLoggedUnit) -> String {
        if unit == .serving {
            let label = formatServings(amount)
            let isOne = label == "1"
            let singular = isOne || amount < 1
            return "\(label) \(singular ? "serving" : "servings")"
        }
        let rounded = roundLoggedAmount(amount, unit: unit)
        let text = rounded == rounded.rounded()
            ? String(Int(rounded.rounded()))
            : String(rounded)
        return "\(text) \(unit.rawValue)"
    }

    static func resolve(
        servings: Double? = nil,
        amount: Double? = nil,
        unit: IntakeLoggedUnit? = nil,
        gramsPerServing: Double?
    ) -> (servings: Double, loggedAmount: Double, loggedUnit: IntakeLoggedUnit)? {
        if let amount, let unit {
            let servingsValue: Double
            let loggedAmount: Double
            if unit == .serving {
                servingsValue = normalizeServings(amount)
                loggedAmount = servingsValue
            } else {
                guard canLogByMass(gramsPerServing), let gramsPerServing,
                      let grams = grams(fromAmount: amount, unit: unit)
                else { return nil }
                servingsValue = normalizeServings(grams / gramsPerServing)
                loggedAmount = roundLoggedAmount(amount, unit: unit)
            }
            guard isServingsInRange(servingsValue) else { return nil }
            if let servings, abs(normalizeServings(servings) - servingsValue) > 0.0001 {
                return nil
            }
            return (servingsValue, loggedAmount, unit)
        }
        guard let servings else { return nil }
        let normalized = normalizeServings(servings)
        guard isServingsInRange(normalized) else { return nil }
        return (normalized, normalized, .serving)
    }
}
