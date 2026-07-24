import Foundation

extension RationAPI {
    // Galley
    func meals(
        limit: Int = 50,
        tag: String? = nil,
        domain: CargoDomain? = nil,
        q: String? = nil
    ) async throws -> MealsResponse {
        var query = [URLQueryItem(name: "limit", value: String(limit))]
        if let tag, !tag.isEmpty { query.append(URLQueryItem(name: "tag", value: tag)) }
        if let domain { query.append(URLQueryItem(name: "domain", value: domain.rawValue)) }
        if let q, !q.trimmingCharacters(in: .whitespaces).isEmpty {
            query.append(URLQueryItem(name: "q", value: q))
        }
        return try await client.get("meals", query: query)
    }

    func mealTags() async throws -> TagsResponse {
        try await client.get("meals/tags")
    }

    func createMeal(_ body: CreateMealRequest) async throws -> CreateMealResponse {
        try await client.post("meals", body: body)
    }

    func updateMeal(id: String, _ body: CreateMealRequest) async throws -> UpdateMealResponse {
        try await client.patch("meals/\(id)", body: body)
    }

    func deleteMeal(_ id: String) async throws {
        let _: EmptyResponse = try await client.delete("meals/\(id)")
    }

    func generateMeal(_ body: GenerateMealRequest) async throws -> AIJobSubmitResponse {
        try await client.post("meals/generate", body: body)
    }

    func generateMealStatus(requestId: String) async throws -> GenerateMealStatusResponse {
        try await client.get("meals/generate/\(requestId)")
    }

    func importRecipe(_ body: ImportRecipeRequest) async throws -> AIJobSubmitResponse {
        try await client.post("meals/import", body: body)
    }

    func importRecipeStatus(requestId: String) async throws -> ImportRecipeStatusResponse {
        try await client.get("meals/import/\(requestId)")
    }

    func importRecipeConfirm(requestId: String) async throws -> ImportRecipeConfirmResponse {
        try await client.post(
            "meals/import/confirm",
            body: ImportRecipeConfirmRequest(requestId: requestId)
        )
    }

    func createProvision(_ body: CreateProvisionRequest) async throws -> CreateProvisionResponse {
        try await client.post("provisions", body: body)
    }

    // Galley (continued)
    func meal(id: String) async throws -> MealDetailResponse {
        try await client.get("meals/\(id)")
    }

    func matchMeals(
        mode: String = "delta",
        limit: Int = 20,
        minMatch: Int? = nil,
        servings: Int? = nil,
        tag: String? = nil,
        domain: CargoDomain? = nil,
        q: String? = nil
    ) async throws -> MealMatchResponse {
        var query: [URLQueryItem] = [
            URLQueryItem(name: "mode", value: mode),
            URLQueryItem(name: "limit", value: String(limit)),
        ]
        if let minMatch {
            query.append(URLQueryItem(name: "minMatch", value: String(minMatch)))
        }
        if let servings {
            query.append(URLQueryItem(name: "servings", value: String(servings)))
        }
        if let tag, !tag.isEmpty {
            query.append(URLQueryItem(name: "tag", value: tag))
        }
        if let domain {
            query.append(URLQueryItem(name: "domain", value: domain.rawValue))
        }
        if let q, !q.isEmpty {
            query.append(URLQueryItem(name: "q", value: q))
        }
        return try await client.get("meals/match", query: query)
    }

    func cookMeal(
        id: String,
        servings: Int? = nil,
        confirmInsufficient: Bool? = nil
    ) async throws -> CookMealResponse {
        try await client.post(
            "meals/\(id)/cook",
            body: CookMealRequest(servings: servings, confirmInsufficient: confirmInsufficient)
        )
    }

    func toggleMealActive(id: String, servings: Int? = nil) async throws -> ToggleActiveResponse {
        if let servings {
            return try await client.post("meals/\(id)/toggle-active", body: ["servings": servings])
        }
        return try await client.post("meals/\(id)/toggle-active", body: EmptyBody())
    }

    func clearMealSelections() async throws -> ClearSelectionsResponse {
        try await client.post("meals/clear-selections", body: EmptyBody())
    }

    func transferCredits(
        sourceOrganizationId: String,
        destinationOrganizationId: String,
        amount: Int
    ) async throws -> TransferCreditsResponse {
        try await client.post(
            "groups/credits/transfer",
            body: TransferCreditsRequest(
                sourceOrganizationId: sourceOrganizationId,
                destinationOrganizationId: destinationOrganizationId,
                amount: amount
            )
        )
    }

    func groupMembers() async throws -> GroupMembersResponse {
        try await client.get("groups/members")
    }

    func createGroup(name: String) async throws -> CreateGroupResponse {
        try await client.post("groups", body: CreateGroupRequest(name: name))
    }

    func createGroupInvitation() async throws -> CreateGroupInvitationResponse {
        try await client.post("groups/invitations/create", body: EmptyBody())
    }

    func updateGroupMemberRole(memberId: String, role: String) async throws -> UpdateGroupMemberRoleResponse {
        try await client.patch(
            "groups/members/\(memberId)/role",
            body: UpdateGroupMemberRoleRequest(role: role)
        )
    }

    func transferGroupOwnership(newOwnerMemberId: String) async throws -> TransferGroupOwnershipResponse {
        try await client.post(
            "groups/ownership/transfer",
            body: TransferGroupOwnershipRequest(newOwnerMemberId: newOwnerMemberId)
        )
    }

    func deleteGroup(organizationId: String, confirmSlug: String? = nil) async throws -> DeleteGroupResponse {
        try await client.post(
            "groups/delete",
            body: DeleteGroupRequest(organizationId: organizationId, confirmSlug: confirmSlug)
        )
    }

}
