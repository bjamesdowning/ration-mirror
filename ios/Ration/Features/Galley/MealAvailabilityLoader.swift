import Foundation

/// Fetches meal match data using the same strict → delta sequence as web `MealDetail.tsx`.
enum MealAvailabilityLoader {
    static func fetchMatch(
        mealId: String,
        servings: Int,
        api: RationAPI
    ) async throws -> MealMatch? {
        let strict = try await api.matchMeals(mode: "strict", limit: 1, servings: servings)
        if let match = strict.matches.first(where: { $0.meal.id == mealId }) {
            return match
        }

        let delta = try await api.matchMeals(
            mode: "delta",
            limit: 100,
            minMatch: 0,
            servings: servings
        )
        return delta.matches.first(where: { $0.meal.id == mealId })
    }
}
