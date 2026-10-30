import Foundation
import XCTest
@testable import Ration

final class AskWebSocketClientDecodingTests: XCTestCase {
    func testDoneFrameReturnsMessageEndWithoutError() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"resp-1","done":true,"body":"{\\"type\\":\\"finish\\"}"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "message_end")
        XCTAssertNil(event.error)
    }

    func testEmptyBodyFrameReturnsNoop() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"resp-2","done":false}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "noop")
        XCTAssertNil(event.error)
    }

    func testReasoningDeltaFrameMapsToReasoningDeltaEvent() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"resp-reason","body":"{\\"type\\":\\"reasoning-delta\\",\\"delta\\":\\"Plan meals\\"}"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "reasoning_delta")
        XCTAssertEqual(event.text, "Plan meals")
    }

    func testTextDeltaFrameMapsToTextDeltaEvent() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"resp-3","body":"{\\"type\\":\\"text-delta\\",\\"id\\":\\"assistant-1\\",\\"delta\\":\\"Hello\\"}"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "text_delta")
        XCTAssertEqual(event.text, "Hello")
        XCTAssertEqual(event.messageId, "assistant-1")
    }

    func testToolOutputAvailableMapsToToolEnd() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"resp-4","body":"{\\"type\\":\\"tool-output-available\\",\\"toolCallId\\":\\"call-1\\",\\"output\\":{\\"id\\":\\"item-1\\"}}"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "tool_end")
        XCTAssertEqual(event.toolCallId, "call-1")
        XCTAssertEqual(event.ok, true)
        XCTAssertNil(event.error)
    }

    func testStructuredToolFailureOutputMapsToUnsuccessfulToolEnd() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"resp-4b","body":"{\\"type\\":\\"tool-output-available\\",\\"toolCallId\\":\\"call-2\\",\\"output\\":{\\"ok\\":false,\\"error\\":{\\"code\\":\\"not_found\\",\\"message\\":\\"Missing\\"}}}"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "tool_end")
        XCTAssertEqual(event.toolCallId, "call-2")
        XCTAssertEqual(event.ok, false)
    }

    func testMalformedBodyReturnsNoopNotError() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"resp-5","body":"not-json"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "noop")
        XCTAssertNil(event.error)
    }

    func testStartChunkIsIgnored() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"resp-6","body":"{\\"type\\":\\"start\\",\\"messageId\\":\\"msg-1\\"}"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "noop")
        XCTAssertNil(event.error)
    }

    func testToolApprovalRequestMapsToApprovalRequestUsingToolCallId() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"resp-approval","body":"{\\"type\\":\\"tool-approval-request\\",\\"approvalId\\":\\"apr-1\\",\\"toolCallId\\":\\"call-9\\"}"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "approval_request")
        XCTAssertEqual(event.approvalId, "call-9")
        XCTAssertEqual(event.title, "Confirm action")
        XCTAssertNil(event.error)
    }

    func testToolApprovalRequestWithoutToolCallIdReturnsError() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"resp-approval-bad","body":"{\\"type\\":\\"tool-approval-request\\",\\"approvalId\\":\\"apr-1\\"}"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "error")
        XCTAssertEqual(event.error?.code, "invalid_approval")
    }

    func testFinishChunkReturnsMessageEnd() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"resp-7","body":"{\\"type\\":\\"finish\\"}"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "message_end")
        XCTAssertNil(event.error)
    }

    func testFinishChunkAfterStreamingFramesEndsTurnOnce() {
        let textDelta = """
        {"type":"cf_agent_use_chat_response","id":"resp-9a","done":false,"body":"{\\"type\\":\\"text-delta\\",\\"delta\\":\\"Done\\"}"}
        """
        let finish = """
        {"type":"cf_agent_use_chat_response","id":"resp-9b","done":false,"body":"{\\"type\\":\\"finish\\"}"}
        """
        let terminalDone = """
        {"type":"cf_agent_use_chat_response","id":"resp-9c","done":true}
        """

        let deltaEvent = CopilotWebSocketDecoder.decode(data: Data(textDelta.utf8))
        let finishEvent = CopilotWebSocketDecoder.decode(data: Data(finish.utf8))
        let doneEvent = CopilotWebSocketDecoder.decode(data: Data(terminalDone.utf8))

        XCTAssertEqual(deltaEvent.type, "text_delta")
        XCTAssertEqual(deltaEvent.text, "Done")
        XCTAssertEqual(finishEvent.type, "message_end")
        XCTAssertNil(finishEvent.error)
        XCTAssertEqual(doneEvent.type, "message_end")
        XCTAssertNil(doneEvent.error)
    }

    func testAgentErrorFrameReturnsErrorEvent() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"resp-8","error":true,"body":"Model unavailable"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "error")
        XCTAssertEqual(event.error?.code, "agent_error")
        XCTAssertEqual(event.error?.message, "Model unavailable")
    }

    func testStructuredAgentErrorFrameReturnsErrorMessage() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"resp-9","error":{"message":"Session expired"}}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "error")
        XCTAssertEqual(event.error?.code, "agent_error")
        XCTAssertEqual(event.error?.message, "Session expired")
    }

    func testNonResponseAgentFrameReturnsNoopNotMessageEnd() {
        let json = """
        {"type":"cf_agent_chat_messages","id":"state-1"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "noop")
        XCTAssertNil(event.error)
    }

    func testStateFrameThenDeltaThenFinishPreservesActiveTurn() {
        let stateFrame = """
        {"type":"cf_agent_chat_messages","id":"state-1"}
        """
        let textDelta = """
        {"type":"cf_agent_use_chat_response","id":"resp-10","body":"{\\"type\\":\\"text-delta\\",\\"delta\\":\\"Hello\\"}"}
        """
        let finish = """
        {"type":"cf_agent_use_chat_response","id":"resp-11","body":"{\\"type\\":\\"finish\\"}"}
        """

        let stateEvent = CopilotWebSocketDecoder.decode(data: Data(stateFrame.utf8))
        let deltaEvent = CopilotWebSocketDecoder.decode(data: Data(textDelta.utf8))
        let finishEvent = CopilotWebSocketDecoder.decode(data: Data(finish.utf8))

        XCTAssertEqual(stateEvent.type, "noop")
        XCTAssertEqual(deltaEvent.type, "text_delta")
        XCTAssertEqual(deltaEvent.text, "Hello")
        XCTAssertEqual(finishEvent.type, "message_end")
    }
}

final class CopilotResumeAndTranscriptDecodingTests: XCTestCase {
    func testStreamResumingDecodesToResumeEvent() {
        let json = """
        {"type":"cf_agent_stream_resuming","id":"cont-1"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "stream_resuming")
        XCTAssertEqual(event.messageId, "cont-1")
        XCTAssertEqual(
            CopilotTranscript.resumeAck(eventType: event.type, id: event.messageId),
            CopilotResumeAck(type: "cf_agent_stream_resume_ack", id: "cont-1")
        )
    }

    func testStreamResumingWithoutIdIsNoopAndDoesNotAck() {
        let json = """
        {"type":"cf_agent_stream_resuming"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "noop")
        XCTAssertNil(CopilotTranscript.resumeAck(eventType: "cf_agent_stream_resuming", id: nil))
        XCTAssertNil(CopilotTranscript.resumeAck(eventType: "cf_agent_use_chat_response", id: "req-1"))
    }

    func testChatMessagesCarryServerTranscript() {
        let json = """
        {"type":"cf_agent_chat_messages","id":"state-2","messages":[{"id":"user-1","role":"user","parts":[{"type":"text","text":"move the rice"}]},{"id":"asst-1","role":"assistant","parts":[{"type":"text","text":"Moved the rice."}]}]}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "chat_messages")
        XCTAssertEqual(event.serverMessages?.count, 2)
        XCTAssertEqual(event.serverMessages?.last?.id, "asst-1")
    }

    func testMessageUpdatedCarriesTheSingleServerMessage() {
        let json = """
        {"type":"cf_agent_message_updated","id":"upd-1","message":{"id":"asst-1","role":"assistant","content":"Let me update that for you. "}}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "message_updated")
        XCTAssertEqual(event.serverMessages?.first?.content, "Let me update that for you. ")
        XCTAssertFalse(
            CopilotTranscript.eventHasAnswer(
                eventType: event.type,
                messages: event.serverMessages ?? []
            )
        )
    }

    func testReplayTextDeltaKeepsTheFrameId() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"cont-9","replay":true,"body":"{\\"type\\":\\"text-delta\\",\\"id\\":\\"chunk-1\\",\\"delta\\":\\"after \\"}"}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "text_delta")
        XCTAssertEqual(event.replay, true)
        XCTAssertEqual(event.messageId, "cont-9")
        XCTAssertEqual(event.text, "after ")
    }

    func testReplayDoneStaysAMessageEndWithTheOldId() {
        let json = """
        {"type":"cf_agent_use_chat_response","id":"old-continuation","done":true,"replay":true,"body":""}
        """
        let event = CopilotWebSocketDecoder.decode(data: Data(json.utf8))

        XCTAssertEqual(event.type, "message_end")
        XCTAssertEqual(event.messageId, "old-continuation")
        XCTAssertNil(event.continuation)
    }
}
