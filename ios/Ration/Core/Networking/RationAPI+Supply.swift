import Foundation

extension RationAPI {
    // Supply — page until exhausted so Crew lists >200 items are complete (P1-C).
    func supply() async throws -> SupplyResponse {
        let pageSize = 200
        var offset = 0
        var allItems: [SupplyItem] = []
        var baseList: SupplyList?

        while true {
            let page: SupplyResponse = try await client.get(
                "supply",
                query: [
                    URLQueryItem(name: "limit", value: String(pageSize)),
                    URLQueryItem(name: "offset", value: String(offset)),
                ]
            )
            guard let list = page.list else {
                return SupplyResponse(list: baseList.map {
                    SupplyList(
                        id: $0.id,
                        name: $0.name,
                        items: allItems,
                        itemCount: $0.itemCount,
                        uncheckedCount: $0.uncheckedCount,
                        purchasedCount: $0.purchasedCount
                    )
                })
            }
            if baseList == nil {
                baseList = list
            }
            allItems.append(contentsOf: list.items)
            if list.items.count < pageSize || offset >= 10_000 {
                break
            }
            offset += pageSize
        }

        guard let base = baseList else {
            return SupplyResponse(list: nil)
        }
        return SupplyResponse(
            list: SupplyList(
                id: base.id,
                name: base.name,
                items: allItems,
                itemCount: base.itemCount ?? allItems.count,
                uncheckedCount: base.uncheckedCount,
                purchasedCount: base.purchasedCount
            )
        )
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
}
