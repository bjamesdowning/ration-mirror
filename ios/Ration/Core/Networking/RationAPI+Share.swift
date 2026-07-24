import Foundation

extension RationAPI {
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

struct CargoRestockBody: Encodable, Sendable {
    let quantity: Double
}

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
