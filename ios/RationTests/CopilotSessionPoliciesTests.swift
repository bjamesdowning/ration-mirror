import XCTest
@testable import Ration

final class CopilotSessionPoliciesTests: XCTestCase {
    func testDockStartsNewChatWhenSheetClosedWithMessages() {
        XCTAssertTrue(
            CopilotDockNewChatPolicy.shouldStartNewChat(
                sheetPresented: false,
                messageCount: 2
            )
        )
    }

    func testDockContinuesChatWhenSheetOpen() {
        XCTAssertFalse(
            CopilotDockNewChatPolicy.shouldStartNewChat(
                sheetPresented: true,
                messageCount: 2
            )
        )
    }

    func testDockDoesNotResetEmptyTranscript() {
        XCTAssertFalse(
            CopilotDockNewChatPolicy.shouldStartNewChat(
                sheetPresented: false,
                messageCount: 0
            )
        )
    }

    func testResumeWithinIdleWindow() {
        let start = Date(timeIntervalSince1970: 1_000)
        let now = Date(timeIntervalSince1970: 1_000 + 19 * 60)
        XCTAssertTrue(
            CopilotSessionResumePolicy.canResume(
                lastActivityAt: start,
                now: now,
                sessionIdleMs: 20 * 60 * 1000
            )
        )
    }

    func testResumeRejectsAfterIdleWindow() {
        let start = Date(timeIntervalSince1970: 1_000)
        let now = Date(timeIntervalSince1970: 1_000 + 21 * 60)
        XCTAssertFalse(
            CopilotSessionResumePolicy.canResume(
                lastActivityAt: start,
                now: now,
                sessionIdleMs: 20 * 60 * 1000
            )
        )
    }

    func testForceIdleWhenSocketDeadAndTurnActive() {
        XCTAssertTrue(
            CopilotSessionResumePolicy.shouldForceIdleAfterResume(
                socketConnected: false,
                isTurnActive: true
            )
        )
        XCTAssertFalse(
            CopilotSessionResumePolicy.shouldForceIdleAfterResume(
                socketConnected: true,
                isTurnActive: true
            )
        )
    }

    func testSessionUsageMergeNeverDecreases() {
        let previous = CopilotSessionUsage(
            totalTokens: 40_000,
            maxTokens: 128_000,
            messageCount: 4,
            maxMessages: 40,
            creditsCharged: 2,
            creditBalance: 8,
            nextCreditAt: 1,
            nextCreditThreshold: 40_001
        )
        let incoming = CopilotSessionUsage(
            totalTokens: 3_000,
            maxTokens: 128_000,
            messageCount: 5,
            maxMessages: 40,
            creditsCharged: 1,
            creditBalance: 7,
            nextCreditAt: 17_001,
            nextCreditThreshold: 20_001
        )
        let merged = CopilotSessionUsage.mergeMonotonic(
            previous: previous,
            incoming: incoming
        )
        XCTAssertEqual(merged.totalTokens, 40_000)
        XCTAssertEqual(merged.creditsCharged, 2)
        XCTAssertEqual(merged.creditBalance, 7)
        XCTAssertEqual(merged.messageCount, 5)
    }
}
