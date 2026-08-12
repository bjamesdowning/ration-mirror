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

    /// String map that coerces non-string JSON values (numbers/bools) to strings
    /// so one bad meal.customFields value cannot fail an entire Hub decode.
    func decodeTolerantStringDictionary(forKey key: Key) -> [String: String]? {
        guard contains(key), (try? decodeNil(forKey: key)) != true else {
            return nil
        }
        if let exact = try? decode([String: String].self, forKey: key) {
            return exact
        }
        guard let raw = try? decode([String: JSONValue].self, forKey: key) else {
            return nil
        }
        var out: [String: String] = [:]
        for (k, value) in raw {
            switch value {
            case let .string(s):
                out[k] = s
            case let .number(n):
                if n.truncatingRemainder(dividingBy: 1) == 0 {
                    out[k] = String(Int(n))
                } else {
                    out[k] = String(n)
                }
            case let .bool(b):
                out[k] = b ? "true" : "false"
            case .null:
                continue
            case .object, .array:
                continue
            }
        }
        return out
    }

    /// Int that tolerates JSON string numbers from D1 aggregates.
    func decodeTolerantInt(forKey key: Key) throws -> Int {
        if let v = try? decode(Int.self, forKey: key) { return v }
        if let d = try? decode(Double.self, forKey: key),
           d.isFinite,
           d.rounded(.towardZero) == d,
           d >= Double(Int.min),
           d <= Double(Int.max) {
            return Int(d)
        }
        if let s = try? decode(String.self, forKey: key), let v = Int(s) { return v }
        throw DecodingError.dataCorruptedError(
            forKey: key,
            in: self,
            debugDescription: "Expected Int-compatible value"
        )
    }

    /// Int that truncates fractional JSON numbers (mobile Int wire fields).
    func decodeTolerantTruncatingInt(forKey key: Key) throws -> Int {
        if let v = try? decode(Int.self, forKey: key) { return v }
        if let d = try? decode(Double.self, forKey: key),
           d.isFinite,
           d >= Double(Int.min),
           d <= Double(Int.max) {
            return Int(d.rounded(.towardZero))
        }
        if let s = try? decode(String.self, forKey: key) {
            if let v = Int(s) { return v }
            if let d = Double(s), d.isFinite {
                return Int(d.rounded(.towardZero))
            }
        }
        throw DecodingError.dataCorruptedError(
            forKey: key,
            in: self,
            debugDescription: "Expected Int-compatible value"
        )
    }

    /// Double that tolerates JSON string numbers from D1 aggregates.
    func decodeTolerantDouble(forKey key: Key) throws -> Double {
        if let v = try? decode(Double.self, forKey: key) { return v }
        if let s = try? decode(String.self, forKey: key), let v = Double(s) { return v }
        throw DecodingError.dataCorruptedError(
            forKey: key,
            in: self,
            debugDescription: "Expected Double-compatible value"
        )
    }

    func decodeTolerantOptionalDouble(forKey key: Key) throws -> Double? {
        guard contains(key), (try? decodeNil(forKey: key)) != true else {
            return nil
        }
        return try decodeTolerantDouble(forKey: key)
    }

    func decodeTolerantOptionalInt(forKey key: Key) throws -> Int? {
        guard contains(key), (try? decodeNil(forKey: key)) != true else {
            return nil
        }
        return try decodeTolerantInt(forKey: key)
    }

    func decodeTolerantOptionalTruncatingInt(forKey key: Key) throws -> Int? {
        guard contains(key), (try? decodeNil(forKey: key)) != true else {
            return nil
        }
        return try decodeTolerantTruncatingInt(forKey: key)
    }

    /// ISO-8601 date (string strategy). Used when Worker may emit odd Date shapes.
    func decodeTolerantDate(forKey key: Key) throws -> Date {
        if let date = try? decode(Date.self, forKey: key) { return date }
        if let s = try? decode(String.self, forKey: key) {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = formatter.date(from: s) { return d }
            formatter.formatOptions = [.withInternetDateTime]
            if let d = formatter.date(from: s) { return d }
        }
        throw DecodingError.dataCorruptedError(
            forKey: key,
            in: self,
            debugDescription: "Expected ISO-8601 date string"
        )
    }

    func decodeTolerantOptionalDate(forKey key: Key) throws -> Date? {
        guard contains(key), (try? decodeNil(forKey: key)) != true else {
            return nil
        }
        return try decodeTolerantDate(forKey: key)
    }
}
