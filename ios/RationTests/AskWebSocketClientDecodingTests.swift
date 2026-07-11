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
}
