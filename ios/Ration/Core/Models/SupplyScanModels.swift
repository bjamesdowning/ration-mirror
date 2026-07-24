import Foundation

// MARK: - Supply scan

struct SupplyScanQuantityProposal: Codable, Sendable {
    let dockQuantity: Double
    let dockUnit: String
    let source: String?
    let supplyQuantity: Double?
    let supplyUnit: String?
    let receiptQuantity: Double?
    let receiptUnit: String?
    let hasDelta: Bool?
}

struct SupplyScanPair: Codable, Sendable, Identifiable {
    var id: String { scanItem.id }
    let scanItem: ScanResultItem
    let supplyItem: SupplyItem?
    let matchScore: Double?
    let matchType: String?
    let wasPreChecked: Bool?
    let quantityProposal: SupplyScanQuantityProposal?
}

struct SupplyScanMatchResponse: Codable, Sendable {
    let requestId: String
    let scanItems: [ScanResultItem]?
    let pairs: [SupplyScanPair]
    let receiptOnly: [ScanResultItem]?
    let supplyOnly: [SupplyItem]?
}

struct SupplyScanCompleteDock: Encodable, Sendable {
    let name: String
    let quantity: Double
    let unit: String
    let domain: String
    var tags: [String] = []
    var expiresAt: String?
}

struct SupplyScanCompletePair: Encodable, Sendable {
    let scanItemId: String
    let supplyItemId: String?
    let matchType: String
    let dock: SupplyScanCompleteDock
    var updateSupply: SupplyScanUpdateSupply?

    enum CodingKeys: String, CodingKey {
        case scanItemId, supplyItemId, matchType, dock, updateSupply
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(scanItemId, forKey: .scanItemId)
        // Zod accepts uuid | null | omitted; encode null so receipt-only pairs validate.
        if let supplyItemId {
            try container.encode(supplyItemId, forKey: .supplyItemId)
        } else {
            try container.encodeNil(forKey: .supplyItemId)
        }
        try container.encode(matchType, forKey: .matchType)
        try container.encode(dock, forKey: .dock)
        try container.encodeIfPresent(updateSupply, forKey: .updateSupply)
    }
}

struct SupplyScanUpdateSupply: Encodable, Sendable {
    let quantity: Double
    let unit: String
}

struct SupplyScanCompleteRequest: Encodable, Sendable {
    let listId: String
    let requestId: String
    let pairs: [SupplyScanCompletePair]
    var supplyOnlyIds: [String]?
}

struct SupplyScanCompleteResponse: Codable, Sendable {
    let docked: Int
    let supplyUpdated: Int?
    let supplyRemoved: Int?
    let replayed: Bool?
}
