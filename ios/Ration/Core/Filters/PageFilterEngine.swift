import Foundation

/// Pure filter/sort helpers — mirrors web `usePageFilters` + client-side refinements.
enum PageFilterEngine {
    static func filterCargo(_ items: [CargoItem], domain: CargoDomain?, tag: String?, search: String) -> [CargoItem] {
        var result = items
        if let domain {
            result = result.filter { $0.domain == domain.rawValue }
        }
        if let tag, !tag.isEmpty {
            result = result.filter { $0.tags.contains(tag) }
        }
        let query = search.trimmingCharacters(in: .whitespaces).lowercased()
        if !query.isEmpty {
            result = result.filter { $0.name.localizedCaseInsensitiveContains(query) }
        }
        return result
    }

    static func filterMeals(_ meals: [Meal], domain: CargoDomain?, tag: String?, search: String) -> [Meal] {
        var result = meals
        if let domain {
            result = result.filter { $0.domain == domain.rawValue }
        }
        if let tag, !tag.isEmpty {
            result = result.filter { $0.tags.contains(tag) }
        }
        let query = search.trimmingCharacters(in: .whitespaces).lowercased()
        if !query.isEmpty {
            result = result.filter { $0.name.localizedCaseInsensitiveContains(query) }
        }
        return result
    }

    static func filterSupplyItems(
        _ items: [SupplyItem],
        sortMode: SupplySortMode,
        hidePurchased: Bool
    ) -> [SupplyItem] {
        var result = items
        if hidePurchased {
            result = result.filter { !$0.isPurchased }
        }
        return sortSupplyItems(result, sortMode: sortMode)
    }

    static func sortSupplyItems(_ items: [SupplyItem], sortMode: SupplySortMode) -> [SupplyItem] {
        switch sortMode {
        case .added:
            return items
        case .alpha:
            return items.sorted {
                $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
        case .unpurchased:
            return items.sorted { a, b in
                if a.isPurchased != b.isPurchased { return !a.isPurchased }
                return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
            }
        }
    }
}
