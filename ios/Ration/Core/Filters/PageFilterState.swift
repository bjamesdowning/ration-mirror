import Foundation
import Observation

enum SupplySortMode: String, CaseIterable, Sendable {
    case alpha, unpurchased, added

    var label: String {
        switch self {
        case .alpha: "A–Z"
        case .unpurchased: "To buy"
        case .added: "Added order"
        }
    }
}

struct PageFilterConfiguration: Sendable {
    var supportsDomain = true
    var supportsTags = true
    var supportsSearch = false
    var supportsMatching = false
    var supportsSupplySort = false
    var supportsSupplyUnitMode = false
}

/// Shared filter state for Cargo, Galley, Supply, and Manifest pages.
@MainActor
@Observable
final class PageFilterState {
    var domain: CargoDomain?
    var selectedTags: [String] = []
    var search = ""
    var matchingEnabled = false
    var supplySort: SupplySortMode = .alpha
    var hidePurchased = false
    var supplyUnitMode: String?

    let configuration: PageFilterConfiguration

    init(configuration: PageFilterConfiguration) {
        self.configuration = configuration
    }

    var hasActiveFilters: Bool {
        if configuration.supportsDomain, domain != nil { return true }
        if configuration.supportsTags, !selectedTags.isEmpty { return true }
        if configuration.supportsSearch, !search.trimmingCharacters(in: .whitespaces).isEmpty { return true }
        if configuration.supportsMatching, matchingEnabled { return true }
        if configuration.supportsSupplySort {
            if supplySort != .alpha { return true }
            if hidePurchased { return true }
        }
        return false
    }

    func clearAll() {
        domain = nil
        selectedTags = []
        search = ""
        matchingEnabled = false
        supplySort = .alpha
        hidePurchased = false
    }
}
