import XCTest
@testable import Ration

final class CopilotTranscriptTests: XCTestCase {
    func testResumeAckUsesTheServerRequestId() {
        XCTAssertEqual(
            CopilotTranscript.resumeAck(eventType: "cf_agent_stream_resuming", id: "req-1"),
            CopilotResumeAck(type: "cf_agent_stream_resume_ack", id: "req-1")
        )
        XCTAssertNil(CopilotTranscript.resumeAck(eventType: "cf_agent_stream_resuming", id: ""))
        XCTAssertNil(CopilotTranscript.resumeAck(eventType: "cf_agent_use_chat_response", id: "req-1"))
    }

    func testMessageUpdatedDoesNotMergeWithoutTheLocalUserId() {
        let current = [
            CopilotMessage(id: "user-1", role: "user", content: "move the rice", createdAt: nil)
        ]
        let next = CopilotTranscript.merge(
            current,
            serverMessages: [
                CopilotServerMessage(
                    id: "asst-other",
                    role: "assistant",
                    parts: [.init(type: "text", text: "from another turn")]
                )
            ]
        )
        XCTAssertEqual(next.map(\.id), ["user-1"])
        XCTAssertEqual(next.map(\.content), ["move the rice"])
    }

    func testChatMessagesStayBetweenThisUserMessageAndTheNext() {
        let current = [
            CopilotMessage(id: "user-1", role: "user", content: "hello first", createdAt: nil),
            CopilotMessage(id: "local-plain", role: "assistant", content: "plain reply to hello first", createdAt: nil),
            CopilotMessage(id: "user-2", role: "user", content: "edit cargo rice", createdAt: nil),
            CopilotMessage(id: "local-empty", role: "assistant", content: "", createdAt: nil),
        ]
        let next = CopilotTranscript.merge(
            current,
            serverMessages: [
                CopilotServerMessage(id: "user-1", role: "user", parts: [.init(type: "text", text: "hello first")]),
                CopilotServerMessage(id: "server-plain", role: "assistant", parts: [.init(type: "text", text: "plain reply to hello first")]),
                CopilotServerMessage(id: "user-2", role: "user", parts: [.init(type: "text", text: "edit cargo rice")]),
                CopilotServerMessage(id: "server-answer", role: "assistant", parts: [.init(type: "text", text: "after tool for edit cargo rice")]),
                CopilotServerMessage(id: "user-3", role: "user", content: "next question"),
                CopilotServerMessage(id: "server-later", role: "assistant", content: "must not merge"),
            ]
        )

        XCTAssertEqual(
            next.map(\.content),
            ["hello first", "plain reply to hello first", "edit cargo rice", "after tool for edit cargo rice"]
        )
        XCTAssertEqual(next[1].id, "local-plain")
        XCTAssertEqual(next[3].id, "local-empty")
    }

    func testSeveralAssistantRowsKeepTheLocalId() {
        let current = [
            CopilotMessage(id: "user-1", role: "user", content: "preedit cargo beans", createdAt: nil),
            CopilotMessage(id: "local-preamble", role: "assistant", content: "Let me update that for you. ", createdAt: nil),
        ]
        let merged = CopilotTranscript.merge(
            current,
            serverMessages: [
                CopilotServerMessage(id: "user-1", role: "user", content: "preedit cargo beans"),
                CopilotServerMessage(id: "server-pause", role: "assistant", content: "Let me update that for you. "),
                CopilotServerMessage(id: "server-summary", role: "assistant", content: "after tool for preedit cargo beans "),
            ]
        )
        XCTAssertEqual(merged.last?.id, "local-preamble")
        XCTAssertEqual(
            merged.last?.content,
            "Let me update that for you. after tool for preedit cargo beans "
        )
        XCTAssertFalse(
            CopilotTranscript.eventHasAnswer(
                eventType: "message_updated",
                messages: [CopilotServerMessage(id: "server-pause", role: "assistant", content: "Let me update that for you. ")]
            )
        )
        XCTAssertTrue(
            CopilotTranscript.eventHasAnswer(
                eventType: "chat_messages",
                messages: mergedServer(current: current)
            )
        )
    }

    func testReplayDoneFromPreviousContinuationDoesNotTargetTheNextTurn() {
        XCTAssertFalse(
            CopilotTranscript.turnEndTargetsCurrentTurn(
                activeRequestId: "next-turn",
                continuationRequestId: nil,
                pauseRequestId: nil,
                requestId: "old-continuation"
            )
        )
        XCTAssertTrue(
            CopilotTranscript.turnEndTargetsCurrentTurn(
                activeRequestId: "next-turn",
                continuationRequestId: nil,
                pauseRequestId: nil,
                requestId: "next-turn"
            )
        )
        XCTAssertFalse(
            CopilotTranscript.turnEndTargetsCurrentTurn(
                activeRequestId: nil,
                continuationRequestId: nil,
                pauseRequestId: nil,
                requestId: "old-continuation"
            )
        )
    }

    func testCancelSendsEveryActiveRequestId() {
        XCTAssertEqual(
            CopilotTranscript.cancelRequestIds(
                activeRequestId: "be5807c4",
                continuationRequestId: "6ed6aa78"
            ),
            ["be5807c4", "6ed6aa78"]
        )
        XCTAssertEqual(
            CopilotTranscript.unionCancelRequestIds(
                requested: ["be5807c4"],
                activeRequestId: "be5807c4",
                continuationRequestId: "6ed6aa78"
            ),
            ["be5807c4", "6ed6aa78"]
        )
        XCTAssertEqual(
            CopilotTranscript.cancelRequestIds(activeRequestId: nil, continuationRequestId: nil),
            []
        )
    }

    func testReplayKeepsThePreambleCapturedAtResume() {
        let local = [
            CopilotMessage(id: "user-1", role: "user", content: "preedit cargo beans", createdAt: nil),
            CopilotMessage(id: "local-preamble", role: "assistant", content: "Let me update that for you. ", createdAt: nil),
        ]
        let baseline = CopilotTranscript.assistantBaseline(local)
        let next = CopilotTranscript.applyReplay(
            local,
            replayedText: "after tool for preedit cargo beans ",
            baseline: baseline
        )
        XCTAssertEqual(next.last?.id, "local-preamble")
        XCTAssertEqual(
            next.last?.content,
            "Let me update that for you. after tool for preedit cargo beans "
        )
        XCTAssertEqual(
            CopilotTranscript.applyReplay(local, replayedText: "after tool for preedit cargo beans ").map(\.content),
            local.map(\.content)
        )
    }

    private func mergedServer(current: [CopilotMessage]) -> [CopilotServerMessage] {
        [
            CopilotServerMessage(id: "user-1", role: "user", content: current[0].content),
            CopilotServerMessage(role: "assistant", content: "Let me update that for you. "),
            CopilotServerMessage(role: "assistant", content: "after tool for preedit cargo beans "),
        ]
    }
}
