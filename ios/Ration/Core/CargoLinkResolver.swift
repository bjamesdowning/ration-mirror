import Foundation

/// Resolves cargo detail navigation targets using the same normalisation
/// as web `cargo-links` (`normalizeForCargoDedup`).
enum CargoLinkResolver {
    struct Row: Sendable {
        let id: String
        let name: String
    }

    static func resolveCargoId(forName name: String, in rows: [Row]) -> String? {
        let target = normalize(name)
        guard !target.isEmpty else { return nil }
        for row in rows where normalize(row.name) == target {
            return row.id
        }
        return nil
    }

    static func resolveCargoId(for ingredient: MealIngredient) -> String? {
        if let resolved = ingredient.resolvedCargoId, !resolved.isEmpty {
            return resolved
        }
        if let linked = ingredient.cargoId, !linked.isEmpty {
            return linked
        }
        return nil
    }

    private static func normalize(_ name: String) -> String {
        CargoNameNormalizer.normalizeForCargoDedup(name)
    }
}
