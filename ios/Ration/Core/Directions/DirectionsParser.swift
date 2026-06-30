import Foundation

struct RecipeStep: Codable, Equatable, Sendable, Identifiable {
    var id: Int { position }
    let position: Int
    let text: String
    let section: String?

    init(position: Int, text: String, section: String? = nil) {
        self.position = position
        self.text = text
        self.section = section
    }
}

enum DirectionsParser {
    static func normalizeDirections(_ raw: Any?) -> [RecipeStep] {
        guard let raw else { return [] }

        if let steps = raw as? [RecipeStep] {
            return normalizeRecipeSteps(steps)
        }

        if let array = raw as? [Any] {
            if array.isEmpty { return [] }

            if let first = array.first as? [String: Any], first["text"] != nil {
                let parsed = array.compactMap { item -> (text: String, section: String?)? in
                    guard let dict = item as? [String: Any],
                          let text = dict["text"] as? String,
                          !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    else { return nil }
                    let section = (dict["section"] as? String)?
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    return (
                        text: text.trimmingCharacters(in: .whitespacesAndNewlines),
                        section: section?.isEmpty == true ? nil : section
                    )
                }
                return parsed.enumerated().map { index, step in
                    RecipeStep(position: index + 1, text: step.text, section: step.section)
                }
            }

            return array
                .map { String(describing: $0).trimmingCharacters(in: .whitespacesAndNewlines) }
                .map { stripNumberedPrefix($0) }
                .filter { !$0.isEmpty }
                .enumerated()
                .map { RecipeStep(position: $0.offset + 1, text: $0.element) }
        }

        if let string = raw as? String {
            let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { return [] }
            return trimmed
                .components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .map { stripNumberedPrefix($0) }
                .filter { !$0.isEmpty }
                .enumerated()
                .map { RecipeStep(position: $0.offset + 1, text: $0.element) }
        }

        return []
    }

    static func parseDirections(_ raw: String?) -> [RecipeStep] {
        guard let raw else { return [] }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return [] }

        if trimmed.hasPrefix("["),
           let data = trimmed.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) {
            return normalizeDirections(json)
        }

        return normalizeDirections(trimmed)
    }

    static func serializeDirections(_ steps: [RecipeStep]) -> String {
        let encoder = JSONEncoder()
        guard let data = try? encoder.encode(steps),
              let string = String(data: data, encoding: .utf8)
        else { return "[]" }
        return string
    }

    private static func normalizeRecipeSteps(_ steps: [RecipeStep]) -> [RecipeStep] {
        steps
            .filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .enumerated()
            .map { index, step in
                RecipeStep(
                    position: index + 1,
                    text: step.text.trimmingCharacters(in: .whitespacesAndNewlines),
                    section: step.section?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                )
            }
    }

    private static func stripNumberedPrefix(_ line: String) -> String {
        let pattern = #"^\d+[.)]\s*"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return line }
        let range = NSRange(line.startIndex..<line.endIndex, in: line)
        return regex.stringByReplacingMatches(in: line, range: range, withTemplate: "")
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
