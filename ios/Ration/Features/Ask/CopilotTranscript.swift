import Foundation

/// Client-side transcript and turn rules shared with web `AskPanel`.
/// Think will not deliver a continuation's text until the resume ack, and the
/// persisted answer arrives on `message_updated` / `chat_messages`.
enum CopilotTranscript {
    static func resumeAck(eventType: String, id: String?) -> CopilotResumeAck? {
        guard eventType == "cf_agent_stream_resuming" || eventType == "stream_resuming" else {
            return nil
        }
        return CopilotResumeAck.make(id: id)
    }

    /// Id of a resumed continuation, from the resuming frame or a continuation done.
    static func continuationRequestId(eventType: String, id: String?, continuation: Bool?) -> String? {
        guard let id, !id.isEmpty else { return nil }
        if eventType == "cf_agent_stream_resuming" || eventType == "stream_resuming" {
            return id
        }
        if continuation == true { return id }
        return nil
    }

    /// A terminal only ends the turn the client is actually in.
    /// Think 0.20 sends a second `done` with `replay: true` after the continuation
    /// finished; that frame still carries the old continuation id.
    static func turnEndTargetsCurrentTurn(
        activeRequestId: String?,
        continuationRequestId: String?,
        pauseRequestId: String?,
        requestId: String?
    ) -> Bool {
        if requestId == nil { return true }
        return requestId == activeRequestId
            || requestId == continuationRequestId
            || requestId == pauseRequestId
    }

    /// Original request id plus the resumed continuation id, without duplicates.
    static func cancelRequestIds(activeRequestId: String?, continuationRequestId: String?) -> [String] {
        var ids: [String] = []
        if let activeRequestId, !activeRequestId.isEmpty {
            ids.append(activeRequestId)
        }
        if let continuationRequestId,
           !continuationRequestId.isEmpty,
           continuationRequestId != activeRequestId {
            ids.append(continuationRequestId)
        }
        return ids
    }

    /// Union the view-model ids with ids the socket already observed.
    /// A resume frame can arrive before Stop reads the view-model copy.
    static func unionCancelRequestIds(
        requested: [String],
        activeRequestId: String?,
        continuationRequestId: String?
    ) -> [String] {
        var ids = requested.filter { !$0.isEmpty }
        for id in cancelRequestIds(
            activeRequestId: activeRequestId,
            continuationRequestId: continuationRequestId
        ) where !ids.contains(id) {
            ids.append(id)
        }
        return ids
    }

    static func shouldApplyServerTranscript(
        turnActive: Bool,
        expectingApprovalContinuation: Bool
    ) -> Bool {
        if expectingApprovalContinuation { return true }
        return turnActive
    }

    static func assistantText(_ message: CopilotServerMessage) -> String {
        guard message.role == "assistant" else { return "" }
        let fromParts = (message.parts ?? [])
            .filter { $0.type == "text" }
            .compactMap(\.text)
            .joined()
        if !fromParts.isEmpty { return fromParts }
        return message.content ?? ""
    }

    static func serverTranscriptHasAnswer(_ messages: [CopilotServerMessage]) -> Bool {
        messages.contains { assistantText($0).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false }
    }

    /// `message_updated` for the pause row repeats the preamble. Counting it as
    /// activity lets a fast continuation finish the turn before `chat_messages`.
    static func eventHasAnswer(eventType: String, messages: [CopilotServerMessage]) -> Bool {
        if eventType == "message_updated" || eventType == "cf_agent_message_updated" {
            return false
        }
        return serverTranscriptHasAnswer(messages)
    }

    /// Assistants after the local last user id, and before the next user message.
    /// A frame that does not contain that id is ignored.
    /// A server id is adopted only when the bubble already has that exact text.
    static func merge(_ current: [CopilotMessage], serverMessages: [CopilotServerMessage]) -> [CopilotMessage] {
        let userIndex = lastUserIndex(current)
        guard userIndex >= 0 else { return current }
        let userId = current[userIndex].id
        guard !userId.isEmpty else { return current }
        guard let serverUserIndex = serverMessages.firstIndex(where: { $0.role == "user" && $0.id == userId }) else {
            return current
        }

        var texts: [String] = []
        var onlyServer: CopilotServerMessage?
        var index = serverUserIndex + 1
        while index < serverMessages.count {
            let server = serverMessages[index]
            if server.role == "user" { break }
            if server.role == "assistant" {
                let text = assistantText(server)
                if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    texts.append(text)
                    onlyServer = texts.count == 1 ? server : nil
                }
            }
            index += 1
        }
        if texts.isEmpty { return current }
        let combined = texts.joined()
        if texts.count == 1, let onlyServer {
            return applyAssistantText(current, userIndex: userIndex, server: onlyServer, text: combined)
        }
        return applyAssistantText(current, userIndex: userIndex, server: CopilotServerMessage(), text: combined)
    }

    static func assistantBaseline(_ messages: [CopilotMessage]) -> String {
        let userIndex = lastUserIndex(messages)
        guard userIndex >= 0 else { return "" }
        guard let trailing = trailingAssistantIndex(messages, userIndex: userIndex) else { return "" }
        return messages[trailing].content
    }

    /// `baseline` is the bubble captured at `stream_resuming`, so a preamble
    /// stays in front of the replayed summary.
    static func applyReplay(
        _ current: [CopilotMessage],
        replayedText: String,
        baseline: String = ""
    ) -> [CopilotMessage] {
        if replayedText.isEmpty { return current }
        let text = baseline.isEmpty ? replayedText : baseline + replayedText
        let userIndex = lastUserIndex(current)
        guard userIndex >= 0 else { return current }
        guard let trailing = trailingAssistantIndex(current, userIndex: userIndex) else {
            if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return current }
            return current + [
                CopilotMessage(id: UUID().uuidString, role: "assistant", content: text, createdAt: nil)
            ]
        }
        let existing = current[trailing]
        if existing.content == text || existing.content.hasPrefix(text) {
            return current
        }
        if text.hasPrefix(existing.content) {
            var copy = current
            copy[trailing] = existing.with(content: text)
            return copy
        }
        return current
    }

    private static func applyAssistantText(
        _ current: [CopilotMessage],
        userIndex: Int,
        server: CopilotServerMessage,
        text: String
    ) -> [CopilotMessage] {
        let id = (server.id?.isEmpty == false) ? server.id : nil
        if let id, let byId = current.firstIndex(where: { $0.id == id }) {
            let existing = current[byId]
            if existing.role == "assistant",
               byId > userIndex,
               text.count > existing.content.count,
               text.hasPrefix(existing.content) {
                var copy = current
                copy[byId] = existing.with(content: text)
                return copy
            }
            return current
        }

        if let trailing = trailingAssistantIndex(current, userIndex: userIndex) {
            let existing = current[trailing]
            if existing.content == text {
                guard let id, existing.id != id else { return current }
                var copy = current
                copy[trailing] = existing.with(id: id)
                return copy
            }
            if text.hasPrefix(existing.content) || existing.content.hasPrefix(text) {
                if existing.content.hasPrefix(text) { return current }
                var copy = current
                copy[trailing] = existing.with(content: text)
                return copy
            }
            return current
        }

        return current + [
            CopilotMessage(
                id: id ?? UUID().uuidString,
                role: "assistant",
                content: text,
                createdAt: nil
            )
        ]
    }

    private static func lastUserIndex(_ messages: [CopilotMessage]) -> Int {
        for index in stride(from: messages.count - 1, through: 0, by: -1) {
            if messages[index].role == "user" { return index }
        }
        return -1
    }

    private static func trailingAssistantIndex(_ messages: [CopilotMessage], userIndex: Int) -> Int? {
        guard userIndex >= 0 else { return nil }
        for index in stride(from: messages.count - 1, through: userIndex + 1, by: -1) {
            if messages[index].role == "assistant" { return index }
        }
        return nil
    }
}
