import Foundation

struct SupplyQuickAddItem: Equatable, Sendable {
    let name: String
    let quantity: Double
    let unit: String
    let domain: String
}

enum SupplyQuickAddParser {
    static let maxItems = 80

    private static let householdWords: Set<String> = [
        "shampoo", "conditioner", "soap", "detergent", "toothpaste", "toothbrush",
        "bleach", "sponge", "sponges", "laundry", "tissue", "tissues", "deodorant", "floss",
    ]

    private static let units = [
        "fl oz", "dozen", "bunch", "clove", "slice", "piece", "stalk", "sprig",
        "head", "pack", "tbsp", "tsp", "cup", "gal", "kg", "lb", "oz", "ml",
        "pt", "qt", "can", "g", "l",
    ]

    /// Mirrors `parseSupplyQuickAdd` on the server. The server result is what gets stored.
    static func parse(_ text: String) -> [SupplyQuickAddItem] {
        let body = stripPreamble(text)
        guard !body.isEmpty else { return [] }
        var merged: [String: SupplyQuickAddItem] = [:]
        var order: [String] = []
        for chunk in body.split(whereSeparator: { $0 == "\n" || $0 == "," || $0 == ";" }) {
            guard let item = parseChunk(String(chunk)) else { continue }
            let key = "\(item.name)::\(item.unit)::\(item.domain)"
            if var existing = merged[key] {
                existing = SupplyQuickAddItem(
                    name: existing.name,
                    quantity: existing.quantity + item.quantity,
                    unit: existing.unit,
                    domain: existing.domain
                )
                merged[key] = existing
            } else {
                merged[key] = item
                order.append(key)
            }
            if order.count >= maxItems { break }
        }
        return order.compactMap { merged[$0] }
    }

    private static func stripPreamble(_ text: String) -> String {
        var rest = text.trimmingCharacters(in: .whitespacesAndNewlines)
        for _ in 0..<3 {
            var next = rest
            if let range = next.range(
                of: #"^(?:okay|ok|hey|please|um|uh|so|alright)[,.\s]+"#,
                options: [.regularExpression, .caseInsensitive]
            ) {
                next.removeSubrange(range)
            }
            if let range = next.range(
                of: #"^(?:i |we )?(?:need|want|add|get|buy|grab|pick up)(?:\s+|$)"#,
                options: [.regularExpression, .caseInsensitive]
            ) {
                next.removeSubrange(range)
            }
            next = next.trimmingCharacters(in: .whitespacesAndNewlines)
            if next == rest { break }
            rest = next
        }
        return rest
    }

    private static func parseChunk(_ raw: String) -> SupplyQuickAddItem? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if let range = text.range(of: #"^[-*•]\s+"#, options: .regularExpression) {
            text.removeSubrange(range)
        }
        if let range = text.range(of: #"^\d+[.)]\s+"#, options: .regularExpression) {
            text.removeSubrange(range)
        }
        text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }

        var quantity = 1.0
        var rest = text
        if let match = text.range(
            of: #"^(\d+(?:\.\d+)?)(?:\s*(?:x|×)\s*|\s+)(.+)$"#,
            options: [.regularExpression, .caseInsensitive]
        ), match == text.startIndex..<text.endIndex {
            let whole = String(text[match])
            // RegexKit is awkward in Foundation; split with NSRegularExpression groups below.
            if let groups = capture(whole, pattern: #"^(\d+(?:\.\d+)?)(?:\s*(?:x|×)\s*|\s+)(.+)$"#),
               let qty = Double(groups[0]), qty >= 0 {
                quantity = qty
                rest = groups[1].trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }

        let split = splitUnit(rest)
        let cleaned = split.name
            .lowercased()
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: ". "))
        guard !cleaned.isEmpty, cleaned.count <= 200 else { return nil }
        return SupplyQuickAddItem(
            name: cleaned,
            quantity: quantity,
            unit: split.unit,
            domain: domain(for: cleaned)
        )
    }

    private static func capture(_ text: String, pattern: String) -> [String]? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
            return nil
        }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        guard let match = regex.firstMatch(in: text, range: range), match.numberOfRanges >= 3 else {
            return nil
        }
        return (1..<match.numberOfRanges).compactMap { index in
            guard let swiftRange = Range(match.range(at: index), in: text) else { return nil }
            return String(text[swiftRange])
        }
    }

    private static func splitUnit(_ rest: String) -> (unit: String, name: String) {
        let lower = rest.lowercased()
        for unit in units {
            let escaped = NSRegularExpression.escapedPattern(for: unit)
            if let regex = try? NSRegularExpression(pattern: "^\(escaped)(?:\\s+|$)", options: [.caseInsensitive]),
               let match = regex.firstMatch(in: lower, range: NSRange(lower.startIndex..<lower.endIndex, in: lower)),
               let matched = Range(match.range, in: rest) {
                let name = String(rest[matched.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
                if !name.isEmpty { return (unit, name) }
            }
        }
        return ("unit", rest)
    }

    private static func domain(for name: String) -> String {
        if name.contains("toilet paper") || name.contains("paper towel") { return "household" }
        if name.split(separator: " ").contains(where: { householdWords.contains(String($0)) }) {
            return "household"
        }
        return "food"
    }
}
