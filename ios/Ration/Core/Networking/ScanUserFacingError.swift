import Foundation

/// Maps scan poll/job errors to customer-facing copy.
/// Technical JSON/parser messages must never reach the UI.
enum ScanUserFacingError {
    static let generic = "Something went wrong while scanning. Please try again."
    static let parse =
        "We couldn't read this receipt. Try a clearer photo or a shorter PDF, then try again."

    private static let technicalPattern = try? NSRegularExpression(
        pattern: #"JSON|Unexpected token|position \d+|Expected ['":{\[\]]|SyntaxError|at position|TypeError|ReferenceError|SQLITE|ECONN"#,
        options: [.caseInsensitive]
    )

    static func message(from serverError: String?) -> String {
        guard let serverError else { return generic }
        let trimmed = serverError.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return generic }
        if looksTechnical(trimmed) { return parse }
        return trimmed
    }

    static func looksTechnical(_ message: String) -> Bool {
        guard let technicalPattern else {
            return message.localizedCaseInsensitiveContains("JSON")
                || message.localizedCaseInsensitiveContains("position")
        }
        let range = NSRange(message.startIndex..<message.endIndex, in: message)
        return technicalPattern.firstMatch(in: message, options: [], range: range) != nil
    }
}
