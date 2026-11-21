import Foundation

/// Pure stream-turn predicates extracted from AskViewModel for unit testing.
enum CopilotTurnReducer {
    static func shouldAcceptObservedEvent(
        isTurnActive: Bool,
        isAwaitingApproval: Bool,
        expectingApprovalContinuation: Bool,
        eventType: String
    ) -> Bool {
        isTurnActive
            || isAwaitingApproval
            || expectingApprovalContinuation
            || eventType == "message_end"
            || eventType == "error"
            || eventType == "approval_request"
            || eventType == "session_usage_update"
            || eventType == "session_limit_warning"
    }

    /// Shown when a turn ends with no answer text and no tool result.
    static let emptyAnswerMessage =
        "Copilot didn't return an answer. Try again, or shorten the question."

    /// Copy for server `copilot_stalled` (iOS < 1.6.40 path) when the frame has no message.
    static let stalledMessage =
        "Ration took too long to answer. Try again, shorten the question, or switch to Deep."

    /// While a stalled turn is recovering, the retry streams under a new request
    /// id. Adopt it so `message_end` targets the turn and Stop cancels it.
    static func adoptedRecoveryRequestId(
        isRecovering: Bool,
        activeRequestId: String?,
        continuationRequestId: String?,
        eventRequestId: String?,
        eventType: String
    ) -> String? {
        guard isRecovering,
              let id = eventRequestId, !id.isEmpty,
              id != activeRequestId,
              id != continuationRequestId
        else { return nil }
        switch eventType {
        case "text_delta", "reasoning_start", "reasoning_delta", "tool_start", "tool_end",
             "message_end", "approval_request":
            return id
        default:
            return nil
        }
    }

    /// True when a turn ended normally but produced nothing to show.
    static func isEmptyAnswer(
        lastMessageRole: String?,
        lastMessageContent: String?,
        sawToolThisTurn: Bool
    ) -> Bool {
        if sawToolThisTurn { return false }
        guard lastMessageRole == "assistant" else { return true }
        return (lastMessageContent ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Whether `message_end` should be ignored (keep approval UI / wait for continuation).
    static func shouldIgnoreMessageEnd(
        isAwaitingApproval: Bool,
        stateIsAwaitingApproval: Bool,
        expectingApprovalContinuation: Bool,
        seenPostApprovalActivity: Bool,
        pauseApprovalRequestId: String?,
        endedMessageId: String?
    ) -> Bool {
        if isAwaitingApproval { return true }
        if stateIsAwaitingApproval { return true }
        if expectingApprovalContinuation && !seenPostApprovalActivity { return true }
        if expectingApprovalContinuation,
           let pauseId = pauseApprovalRequestId,
           let endedId = endedMessageId,
           pauseId == endedId
        {
            return true
        }
        return false
    }
}
