import Foundation

enum CopilotContinuationCopy {
    static let draftPrefix = "Continuing from our previous chat: "

    static func continuationDraft() -> String {
        draftPrefix
    }

    static func transcriptForCopy(_ messages: [CopilotMessage]) -> String {
        messages
            .filter { !$0.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .map { message in
                let speaker = message.role == "user" ? "You" : "Ration"
                return "\(speaker): \(message.content.trimmingCharacters(in: .whitespacesAndNewlines))"
            }
            .joined(separator: "\n\n")
    }
}
