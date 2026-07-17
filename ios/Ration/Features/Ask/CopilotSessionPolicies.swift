import Foundation

enum CopilotDockNewChatPolicy {
    /// Dock composer with the sheet closed starts a fresh conversation when a
    /// prior transcript exists. Sheet-open sends continue the same thread.
    static func shouldStartNewChat(sheetPresented: Bool, messageCount: Int) -> Bool {
        !sheetPresented && messageCount > 0
    }
}

enum CopilotSessionResumePolicy {
    static func canResume(lastActivityAt: Date, now: Date, sessionIdleMs: Int) -> Bool {
        guard sessionIdleMs > 0 else { return false }
        let idle = TimeInterval(sessionIdleMs) / 1000
        return now.timeIntervalSince(lastActivityAt) <= idle
    }

    static func shouldForceIdleAfterResume(socketConnected: Bool, isTurnActive: Bool) -> Bool {
        !socketConnected && isTurnActive
    }
}
