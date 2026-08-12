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

    func clearNutritionGoal(
        operationKey: String = UUID().uuidString
    ) async throws -> NutritionGoalClearResponse {
        try await client.delete(
            "nutrition/goals",
            query: [URLQueryItem(name: "operationKey", value: operationKey)]
        )
    }

    func nutritionPrivacy() async throws -> NutritionPrivacyResponse {
        try await client.get("privacy/nutrition")
    }

    func grantNutritionConsent(_ status: NutritionConsentStatus) async throws -> NutritionPrivacyResponse {
        try await client.post(
            "privacy/nutrition",
            body: NutritionConsentGrantRequest(
                purpose: status.purpose,
                policyVersion: status.statement.policyVersion,
                statementVersion: status.statement.statementVersion,
                statementSha256: status.statement.sha256,
                requestId: UUID().uuidString
            )
        )
    }

    func withdrawNutritionConsent(_ purpose: NutritionConsentPurpose) async throws -> NutritionPrivacyResponse {
        try await client.post(
            "privacy/nutrition",
            body: NutritionConsentWithdrawRequest(
                purpose: purpose,
                requestId: UUID().uuidString
            )
        )
    }

    func eraseNutritionData(_ dataset: String) async throws -> NutritionPrivacyResponse {
        try await client.post(
            "privacy/nutrition",
            body: NutritionDataEraseRequest(
                dataset: dataset,
                requestId: UUID().uuidString
            )
        )
    }

    func featureEnablement() async throws -> FeatureEnablementStatusResponse {
        try await client.get("privacy/features")
    }

    func setFeatureEnablement(
        aiFeatures: Bool,
        macroTracking: Bool,
        affirmed: Bool = true
    ) async throws -> FeatureEnablementStatusResponse {
        _ = affirmed
        return try await client.post(
            "privacy/features",
            body: FeatureEnablementSetRequest(
                aiFeatures: aiFeatures,
                macroTracking: macroTracking
            )
        )
    }

    func eraseFeatureNutritionData(dataset: String) async throws -> FeatureEnablementStatusResponse {
        try await client.post(
            "privacy/features",
            body: FeatureEnablementEraseRequest(
                dataset: dataset,
                requestId: UUID().uuidString
            )
        )
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
