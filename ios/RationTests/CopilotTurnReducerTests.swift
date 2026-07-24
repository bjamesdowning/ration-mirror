import XCTest
@testable import Ration

final class CopilotTurnReducerTests: XCTestCase {
    func testAcceptsActiveTurnEvents() {
        XCTAssertTrue(
            CopilotTurnReducer.shouldAcceptObservedEvent(
                isTurnActive: true,
                isAwaitingApproval: false,
                expectingApprovalContinuation: false,
                eventType: "text_delta"
            )
        )
    }

    func testRejectsIdleNoise() {
        XCTAssertFalse(
            CopilotTurnReducer.shouldAcceptObservedEvent(
                isTurnActive: false,
                isAwaitingApproval: false,
                expectingApprovalContinuation: false,
                eventType: "text_delta"
            )
        )
    }

    func testAlwaysAcceptsTerminalTypes() {
        for type in ["message_end", "error", "approval_request", "session_usage_update", "session_limit_warning"] {
            XCTAssertTrue(
                CopilotTurnReducer.shouldAcceptObservedEvent(
                    isTurnActive: false,
                    isAwaitingApproval: false,
                    expectingApprovalContinuation: false,
                    eventType: type
                ),
                type
            )
        }
    }

    func testIgnoresMessageEndWhileAwaitingApproval() {
        XCTAssertTrue(
            CopilotTurnReducer.shouldIgnoreMessageEnd(
                isAwaitingApproval: true,
                stateIsAwaitingApproval: false,
                expectingApprovalContinuation: false,
                seenPostApprovalActivity: false,
                pauseApprovalRequestId: nil,
                endedMessageId: "m1"
            )
        )
    }

    func testIgnoresMessageEndUntilPostApprovalActivity() {
        XCTAssertTrue(
            CopilotTurnReducer.shouldIgnoreMessageEnd(
                isAwaitingApproval: false,
                stateIsAwaitingApproval: false,
                expectingApprovalContinuation: true,
                seenPostApprovalActivity: false,
                pauseApprovalRequestId: "pause",
                endedMessageId: "other"
            )
        )
        XCTAssertFalse(
            CopilotTurnReducer.shouldIgnoreMessageEnd(
                isAwaitingApproval: false,
                stateIsAwaitingApproval: false,
                expectingApprovalContinuation: true,
                seenPostApprovalActivity: true,
                pauseApprovalRequestId: "pause",
                endedMessageId: "other"
            )
        )
    }

    func testIgnoresPauseStreamTerminalMatchingApprovalId() {
        XCTAssertTrue(
            CopilotTurnReducer.shouldIgnoreMessageEnd(
                isAwaitingApproval: false,
                stateIsAwaitingApproval: false,
                expectingApprovalContinuation: true,
                seenPostApprovalActivity: true,
                pauseApprovalRequestId: "pause-1",
                endedMessageId: "pause-1"
            )
        )
    }
}
