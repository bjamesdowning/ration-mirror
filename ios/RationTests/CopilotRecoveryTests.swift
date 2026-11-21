import Foundation
import XCTest
@testable import Ration

/// Stall recovery (web 1.11.27 / iOS 1.6.40): a stalled turn that Think retries
/// must stay active, adopt the retry's request id, and end with clear copy.
final class CopilotRecoveryTests: XCTestCase {
    func testRecoveringDoneFrameIsNotMessageEnd() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"req-1","done":true,"body":"","outcome":"recovering"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "turn_recovering")
        XCTAssertEqual(event.messageId, "req-1")
    }

    func testPlainDoneFrameStaysMessageEnd() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"req-1","done":true,"body":""}
        """
        XCTAssertEqual(CopilotWebSocketDecoder.decode(data: Data(json.utf8)).type, "message_end")
    }

    func testChatRecoveringStatusFrames() {
        let on = """
        {"type":"cf_agent_chat_recovering","recovering":true}
        """
        let off = """
        {"type":"cf_agent_chat_recovering","recovering":false}
        """
        XCTAssertEqual(CopilotWebSocketDecoder.decode(data: Data(on.utf8)).type, "recovering_started")
        XCTAssertEqual(CopilotWebSocketDecoder.decode(data: Data(off.utf8)).type, "recovering_ended")
    }

    func testBillingStoppedAndStalledErrorsDecode() {
        for code in ["billing_stopped", "copilot_stalled"] {
            let json = """
            {"type":"error","error":{"code":"\(code)","message":"m"}}
            """
            let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))
            XCTAssertEqual(event.type, "error")
            XCTAssertEqual(event.error?.code, code)
        }
    }

    func testAcceptsRecoveryEventsWhileTurnActive() {
        for type in ["turn_recovering", "text_delta"] {
            XCTAssertTrue(
                CopilotTurnReducer.shouldAcceptObservedEvent(
                    isTurnActive: true,
                    isAwaitingApproval: false,
                    expectingApprovalContinuation: false,
                    eventType: type
                )
            )
        }
    }

    func testAdoptsRetryRequestIdWhileRecovering() {
        XCTAssertEqual(
            CopilotTurnReducer.adoptedRecoveryRequestId(
                isRecovering: true,
                activeRequestId: "req-1",
                continuationRequestId: nil,
                eventRequestId: "retry-2",
                eventType: "text_delta"
            ),
            "retry-2"
        )
    }

    func testDoesNotAdoptWhenNotRecoveringOrSameId() {
        XCTAssertNil(
            CopilotTurnReducer.adoptedRecoveryRequestId(
                isRecovering: false,
                activeRequestId: "req-1",
                continuationRequestId: nil,
                eventRequestId: "retry-2",
                eventType: "text_delta"
            )
        )
        XCTAssertNil(
            CopilotTurnReducer.adoptedRecoveryRequestId(
                isRecovering: true,
                activeRequestId: "req-1",
                continuationRequestId: nil,
                eventRequestId: "req-1",
                eventType: "text_delta"
            )
        )
        XCTAssertNil(
            CopilotTurnReducer.adoptedRecoveryRequestId(
                isRecovering: true,
                activeRequestId: "req-1",
                continuationRequestId: nil,
                eventRequestId: "retry-2",
                eventType: "session_usage_update"
            )
        )
    }

    func testEmptyAnswerDetection() {
        XCTAssertTrue(
            CopilotTurnReducer.isEmptyAnswer(
                lastMessageRole: "user",
                lastMessageContent: "Plan my week",
                sawToolThisTurn: false
            )
        )
        XCTAssertTrue(
            CopilotTurnReducer.isEmptyAnswer(
                lastMessageRole: "assistant",
                lastMessageContent: "  \n",
                sawToolThisTurn: false
            )
        )
        XCTAssertFalse(
            CopilotTurnReducer.isEmptyAnswer(
                lastMessageRole: "assistant",
                lastMessageContent: "Done.",
                sawToolThisTurn: false
            )
        )
        XCTAssertFalse(
            CopilotTurnReducer.isEmptyAnswer(
                lastMessageRole: "user",
                lastMessageContent: "x",
                sawToolThisTurn: true
            )
        )
    }
}
