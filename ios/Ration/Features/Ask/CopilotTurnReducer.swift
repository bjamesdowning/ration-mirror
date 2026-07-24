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
