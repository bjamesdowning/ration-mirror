import Foundation

/// Typed facade over `APIClient` — one method per `/api/mobile/v1` route used by the app.
@MainActor
final class RationAPI {
    let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    // Session / org
    func session() async throws -> SessionResponse {
        try await client.get("session")
    }

    func activateOrg(_ id: String) async throws -> TokenPair {
        try await client.post("orgs/\(id)/activate", body: EmptyBody())
    }

    func deleteAccount() async throws -> AccountDeleteResponse {
        try await client.delete("account")
    }

    // Settings
    func settings() async throws -> SettingsResponse {
        try await client.get("settings")
    }

    func patchSettings(_ patch: SettingsPatch) async throws -> SettingsResponse {
        try await client.patch("settings", body: patch)
    }

    // Hub
    func hub() async throws -> HubResponse {
        try await client.get("hub")
    }

    // Cargo
    func cargo(cursor: String? = nil, domain: CargoDomain? = nil, limit: Int = 50) async throws -> CargoPage {
        var query = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
        if let domain { query.append(URLQueryItem(name: "domain", value: domain.rawValue)) }
        return try await client.get("cargo", query: query)
    }

    func cargoItem(id: String) async throws -> CargoDetailResponse {
        try await client.get("cargo/\(id)")
    }

    func createCargo(_ body: CreateCargoRequest) async throws -> CreateCargoResponse {
        try await client.post("cargo", body: body)
    }

    func updateCargo(id: String, _ body: UpdateCargoRequest) async throws -> CargoDetailResponse {
        try await client.patch("cargo/\(id)", body: body)
    }

    func deleteCargo(_ id: String) async throws {
        let _: EmptyResponse = try await client.delete("cargo/\(id)")
    }

    func batchAddCargo(_ body: BatchCargoRequest) async throws -> BatchCargoResponse {
        try await client.post("cargo/batch", body: body)
    }

    func search(query: String) async throws -> SearchResponse {
        try await client.get("search", query: [URLQueryItem(name: "q", value: query)])
    }

    func cargoTags() async throws -> TagsResponse {
        try await client.get("cargo/tags")
    }

    func cargoTagIndex() async throws -> CargoTagIndexResponse {
        try await client.get("cargo/tag-index")
    }

    // Supply
    func supply() async throws -> SupplyResponse {
        try await client.get("supply")
    }

    func toggleSupplyItem(_ id: String, isPurchased: Bool) async throws -> EmptyResponse {
        try await client.patch("supply/items/\(id)", body: ["isPurchased": isPurchased])
    }

    func updateSupplyItem(_ id: String, quantity: Double?, unit: String?, isPurchased: Bool?) async throws -> EmptyResponse {
        var body: [String: EncodableValue] = [:]
        if let quantity { body["quantity"] = .double(quantity) }
        if let unit { body["unit"] = .string(unit) }
        if let isPurchased { body["isPurchased"] = .bool(isPurchased) }
        return try await client.patch("supply/items/\(id)", body: body)
    }

    func syncSupply() async throws -> SupplySyncResponse {
        try await client.post("supply/sync", body: EmptyBody())
    }

    func completeSupply(listId: String) async throws -> SupplyCompleteResponse {
        try await client.post("supply/complete", body: SupplyCompleteRequest(listId: listId))
    }

    func fetchSupplyScanMatch(listId: String, requestId: String) async throws -> SupplyScanMatchResponse {
        try await client.get(
            "supply/scan",
            query: [
                URLQueryItem(name: "listId", value: listId),
                URLQueryItem(name: "requestId", value: requestId),
            ]
        )
    }

    func completeSupplyScan(
        listId: String,
        requestId: String,
        pairs: [SupplyScanCompletePair],
        supplyOnlyIds: [String]? = nil
    ) async throws -> SupplyScanCompleteResponse {
        try await client.post(
            "supply/scan",
            body: SupplyScanCompleteRequest(
                listId: listId,
                requestId: requestId,
                pairs: pairs,
                supplyOnlyIds: supplyOnlyIds
            )
        )
    }

    func addSupplyItem(_ body: CreateSupplyItemRequest) async throws -> CreateSupplyItemResponse {
        try await client.post("supply/items", body: body)
    }

    func deleteSupplyItem(_ id: String) async throws {
        let _: EmptyResponse = try await client.delete("supply/items/\(id)")
    }

    // Galley
    func meals(limit: Int = 50, tag: String? = nil, domain: CargoDomain? = nil) async throws -> MealsResponse {
        var query = [URLQueryItem(name: "limit", value: String(limit))]
        if let tag, !tag.isEmpty { query.append(URLQueryItem(name: "tag", value: tag)) }
        if let domain { query.append(URLQueryItem(name: "domain", value: domain.rawValue)) }
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
        servings: Int? = nil
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
        return try await client.get("meals/match", query: query)
    }

    func cookMeal(id: String, servings: Int? = nil) async throws -> CookMealResponse {
        if let servings {
            return try await client.post("meals/\(id)/cook", body: ["servings": servings])
        }
        return try await client.post("meals/\(id)/cook", body: EmptyBody())
    }

    func toggleMealActive(id: String, servings: Int? = nil) async throws -> ToggleActiveResponse {
        if let servings {
            return try await client.post("meals/\(id)/toggle-active", body: ["servings": servings])
        }
        return try await client.post("meals/\(id)/toggle-active", body: EmptyBody())
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

    func createGroup(name: String, slug: String) async throws -> CreateGroupResponse {
        try await client.post("groups", body: CreateGroupRequest(name: name, slug: slug))
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

    // Manifest
    func manifest(startDate: String? = nil, endDate: String? = nil) async throws -> ManifestResponse {
        var query: [URLQueryItem] = []
        if let startDate { query.append(URLQueryItem(name: "startDate", value: startDate)) }
        if let endDate { query.append(URLQueryItem(name: "endDate", value: endDate)) }
        return try await client.get("manifest", query: query)
    }

    func addManifestEntry(_ entry: ManifestEntryCreate) async throws -> ManifestEntryCreateResponse {
        try await client.post("manifest", body: entry)
    }

    func consumeManifestEntries(
        _ entryIds: [String],
        confirmInsufficient: Bool? = nil
    ) async throws -> ManifestConsumeResponse {
        try await client.post(
            "manifest/consume",
            body: ManifestConsumeRequest(entryIds: entryIds, confirmInsufficient: confirmInsufficient)
        )
    }

    func toggleManifestDaySupply(date: String) async throws -> ManifestSupplyDayToggleResponse {
        try await client.post("manifest/supply-days/\(date)", body: EmptyBody())
    }

    func undoAction(token: String) async throws -> UndoActionResponse {
        try await client.post("undo", body: UndoActionRequest(token: token))
    }

    func planWeek(_ body: PlanWeekRequest) async throws -> AIJobSubmitResponse {
        try await client.post("manifest/plan-week", body: body)
    }

    func planWeekStatus(requestId: String) async throws -> PlanWeekStatusResponse {
        try await client.get("manifest/plan-week/\(requestId)")
    }

    func bulkManifest(_ body: BulkManifestRequest) async throws -> BulkManifestResponse {
        try await client.post("manifest/bulk", body: body)
    }

    func deleteManifestEntry(_ entryId: String) async throws -> ManifestEntryDeleteResponse {
        try await client.delete("manifest/entries/\(entryId)")
    }

    // Billing
    func billingStatus() async throws -> BillingStatus {
        try await client.get("billing/status")
    }

    // Scan
    func submitScan(imageData: Data) async throws -> ScanSubmitResponse {
        try await client.uploadImage("scan", imageData: imageData)
    }

    func scanStatus(requestId: String) async throws -> ScanStatusResponse {
        try await client.get("scan/\(requestId)")
    }

    // Avatars
    func uploadUserAvatar(imageData: Data, mimeType: String = "image/jpeg") async throws -> AvatarUploadResponse {
        try await client.uploadAvatar("user/avatar", imageData: imageData, mimeType: mimeType)
    }

    func uploadOrganizationAvatar(imageData: Data, mimeType: String = "image/jpeg") async throws -> OrgAvatarUploadResponse {
        try await client.uploadAvatar("organization/avatar", imageData: imageData, mimeType: mimeType)
    }

    // Share
    func manifestShareStatus() async throws -> ShareStatusResponse {
        try await client.get("manifest/share")
    }

    func createManifestShare() async throws -> ShareCreateResponse {
        try await client.post("manifest/share", body: EmptyBody())
    }

    func revokeManifestShare() async throws -> ShareRevokeResponse {
        try await client.delete("manifest/share")
    }

    func supplyShareStatus() async throws -> ShareStatusResponse {
        try await client.get("supply/share")
    }

    func createSupplyShare() async throws -> ShareCreateResponse {
        try await client.post("supply/share", body: EmptyBody())
    }

    func revokeSupplyShare() async throws -> ShareRevokeResponse {
        try await client.delete("supply/share")
    }

    func supplySnoozes() async throws -> SupplySnoozesResponse {
        try await client.get("supply/snoozes")
    }

    func snoozeSupplyItem(_ id: String, duration: String) async throws -> SupplySnoozeResponse {
        try await client.post("supply/items/\(id)", body: SnoozeRequest(duration: duration))
    }

    func unsnoozeSupplyItem(_ snoozeId: String) async throws -> SupplyUnsnoozeResponse {
        try await client.delete("supply/snoozes/\(snoozeId)")
    }
}

struct EmptyBody: Encodable, Sendable {}

struct SnoozeRequest: Encodable, Sendable {
    let duration: String
}

/// Heterogeneous JSON body for supply item PATCH.
enum EncodableValue: Encodable {
    case string(String)
    case double(Double)
    case bool(Bool)

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let v): try container.encode(v)
        case .double(let v): try container.encode(v)
        case .bool(let v): try container.encode(v)
        }
    }
}

struct EmptyResponse: Decodable, Sendable {
    init() {}
    init(from decoder: Decoder) throws {}
}
