import Foundation

extension RationAPI {
    // Nutrition goals — gated by `nutrition-goals` (fail-closed server-side).
    func nutritionGoal() async throws -> NutritionGoalResponse {
        try await client.get("nutrition/goals")
    }

    func upsertNutritionGoal(_ body: NutritionGoalUpsertRequest) async throws -> NutritionGoalResponse {
        try await client.post("nutrition/goals", body: body)
    }

    func clearNutritionGoal() async throws -> NutritionGoalClearResponse {
        try await client.delete("nutrition/goals")
    }

    // Nutrition summary — gated by `nutrition-goals` OR `nutrition-manifest`.
    func nutritionSummary(from: String, to: String) async throws -> NutritionSummary {
        try await client.get(
            "nutrition/summary",
            query: [
                URLQueryItem(name: "from", value: from),
                URLQueryItem(name: "to", value: to),
            ]
        )
    }
}
