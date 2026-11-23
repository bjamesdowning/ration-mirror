import Foundation

/// Cargo, then Galley, for the Add Fuel menu.
/// Search still fills these rows. The sheet does not lay them under the field.
enum AddFuelKitchen {
    struct Hit: Equatable, Identifiable {
        var id: String
        var name: String
    }

    struct Tagged: Equatable, Identifiable {
        var id: String
        var name: String
        var tagNames: [String]
    }

    struct Picker: Equatable {
        var cargo: [Hit]
        var meals: [Tagged]
        /// True only when the sheet should paint kitchen rows under the search field.
        var listsUnderSearch: Bool

        var groupedNames: [String] {
            cargo.map(\.name) + meals.map(\.name)
        }
    }

    static func picker(
        query: String,
        selectedTags: Set<String>,
        cargoPage: [Tagged],
        searchHits: [Hit],
        meals: [Tagged],
        limit: Int = 20
    ) -> Picker {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return Picker(
            cargo: cargoRows(
                trimmed: trimmed,
                selectedTags: selectedTags,
                cargoPage: cargoPage,
                searchHits: searchHits,
                limit: limit
            ),
            meals: mealRows(
                trimmed: trimmed,
                selectedTags: selectedTags,
                meals: meals,
                limit: limit
            ),
            listsUnderSearch: false
        )
    }

    private static func cargoRows(
        trimmed: String,
        selectedTags: Set<String>,
        cargoPage: [Tagged],
        searchHits: [Hit],
        limit: Int
    ) -> [Hit] {
        let base: [Hit]
        if trimmed.count >= 2 {
            base = searchHits
        } else if trimmed.count == 1 {
            let needle = trimmed.lowercased()
            base = cargoPage
                .filter { $0.name.lowercased().contains(needle) }
                .map { Hit(id: $0.id, name: $0.name) }
        } else {
            base = cargoPage.map { Hit(id: $0.id, name: $0.name) }
        }
        guard !selectedTags.isEmpty else { return Array(base.prefix(limit)) }
        let allowed = Set(cargoPage.filter { matches($0.tagNames, selectedTags) }.map(\.id))
        return Array(base.filter { allowed.contains($0.id) }.prefix(limit))
    }

    private static func mealRows(
        trimmed: String,
        selectedTags: Set<String>,
        meals: [Tagged],
        limit: Int
    ) -> [Tagged] {
        let needle = trimmed.lowercased()
        return Array(
            meals.filter { meal in
                let nameOK = needle.isEmpty || meal.name.lowercased().contains(needle)
                return nameOK && matches(meal.tagNames, selectedTags)
            }.prefix(limit)
        )
    }

    private static func matches(_ tagNames: [String], _ selected: Set<String>) -> Bool {
        if selected.isEmpty { return true }
        let names = Set(tagNames)
        return selected.contains { names.contains($0) }
    }
}
