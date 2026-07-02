import Foundation

enum GalleyMatchMapBuilder {
    static func build(from matches: [MealMatch]) -> [String: MealMatch] {
        Dictionary(uniqueKeysWithValues: matches.map { ($0.meal.id, $0) })
    }
}
