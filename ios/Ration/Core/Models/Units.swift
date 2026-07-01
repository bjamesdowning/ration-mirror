import Foundation

/// Canonical units — mirrors `app/lib/units.ts` `SUPPORTED_UNITS`.
enum RationUnits {
    enum Group: String, CaseIterable, Identifiable {
        case weight = "Weight"
        case volume = "Volume"
        case count = "Count"

        var id: String { rawValue }
    }

    static let all: [String] = [
        "kg", "g", "lb", "oz",
        "ml", "l", "tsp", "tbsp", "fl oz", "cup", "pt", "qt", "gal",
        "unit", "piece", "dozen", "bunch", "clove", "slice", "head", "stalk", "sprig", "can", "pack",
    ]

    /// Web `CargoEditModal` subset (9 options).
    static let cargoEdit: [String] = [
        "g", "kg", "oz", "lb",
        "ml", "l", "cup", "tbsp", "unit",
    ]

    static func group(for unit: String) -> Group {
        switch unit {
        case "kg", "g", "lb", "oz":
            return .weight
        case "ml", "l", "tsp", "tbsp", "fl oz", "cup", "pt", "qt", "gal":
            return .volume
        default:
            return .count
        }
    }

    static func units(in group: Group, from list: [String] = all) -> [String] {
        list.filter { Self.group(for: $0) == group }
    }

    static func isSupported(_ unit: String) -> Bool {
        all.contains(unit)
    }
}
