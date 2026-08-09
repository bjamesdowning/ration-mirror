import Foundation

extension RationAPI {
    // Nutrition goals — gated by `nutrition-goals` (fail-closed server-side).
    /// - Parameter asOf: Client local YYYY-MM-DD so GET matches the device calendar
    ///   used when saving `effectiveFrom` (avoids UTC midnight skew).
    func nutritionGoal(asOf: String? = nil) async throws -> NutritionGoalResponse {
        var query: [URLQueryItem] = []
        if let asOf {
            query.append(URLQueryItem(name: "asOf", value: asOf))
        }
        return try await client.get("nutrition/goals", query: query)
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

    /// Propose cargo nutrition snapshots for scan review — gated by `nutrition-engine`.
    func resolveNutrition(
        names: [String],
        ingestSource: String? = nil
    ) async throws -> NutritionResolveResponse {
        try await client.post(
            "nutrition/resolve",
            body: NutritionResolveRequest(names: names, ingestSource: ingestSource)
        )
    }
}
