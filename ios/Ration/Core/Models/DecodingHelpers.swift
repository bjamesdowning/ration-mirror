import Foundation

// Shared JSON / tolerant decoding helpers used by Cargo, Meal, Scan DTOs.

/// Lightweight dynamic JSON value for scan metadata/result payloads.
enum JSONValue: Codable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case let .bool(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        case let .array(value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

extension KeyedDecodingContainer {
    /// Decodes a `[String]` that may arrive as a real array or, for legacy
    /// double-encoded backend rows, a JSON-encoded or comma-separated string.
    /// Returns `[]` when the key is missing, null, or otherwise unparseable.
    func decodeTolerantStringArray(forKey key: Key) -> [String] {
        if let array = try? decode([String].self, forKey: key) {
            return array
        }
        guard let raw = try? decode(String.self, forKey: key) else {
            return []
        }
        if let data = raw.data(using: .utf8),
           let parsed = try? JSONDecoder().decode([String].self, from: data) {
            return parsed
        }
        return raw
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    /// Decodes `[Tag]` objects or legacy `[String]` slug arrays.
    func decodeTolerantTags(forKey key: Key) -> [Tag] {
        if let tags = try? decode([Tag].self, forKey: key) {
            return tags
        }
        return decodeTolerantStringArray(forKey: key).map { Tag(slug: $0) }
    }
}
