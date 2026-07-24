import Foundation

// MARK: - Scan

/// `POST /api/mobile/v1/scan` — async queue submission.
struct ScanSubmitResponse: Codable, Sendable {
    let requestId: String?
    let status: String?
}

/// `GET /api/mobile/v1/scan/:requestId`
struct ScanStatusResponse: Codable, Sendable {
    let status: String
    let items: [ScanResultItem]?
    let existingInventory: [[String: JSONValue]]?
    let metadata: [String: JSONValue]?
    let error: String?
}

struct ScanResultItem: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let quantity: Double
    let unit: String
    let domain: String?
    let tags: [String]?
    let expiresAt: String?
    let confidence: Double?
}
