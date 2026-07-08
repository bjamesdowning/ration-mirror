import Foundation

/// Lenient WebSocket frame parsing for the Copilot agent protocol.
/// Matches web `AskPanel` behaviour: skip `done` frames and ignore unknown chunks.
enum CopilotWebSocketDecoder {
    static func decode(data: Data) -> CopilotStreamEvent {
        if let frame = try? JSON.decoder.decode(AgentFrameProbe.self, from: data),
           frame.type.hasPrefix("cf_agent_") {
            return decodeAgentFrame(data)
        }
        if let event = try? JSON.decoder.decode(CopilotStreamEvent.self, from: data) {
            return event
        }
        if let text = String(data: data, encoding: .utf8) {
            return CopilotStreamEvent(
                type: "error",
                message: nil,
                messageId: nil,
                text: nil,
                usageTokens: nil,
                status: nil,
                toolCallId: nil,
                ok: nil,
                error: CopilotToolError(
                    code: "invalid_message",
                    message: "Copilot sent an unsupported message: \(text.prefix(80))"
                ),
                approvalId: nil,
                toolName: nil,
                title: nil,
                description: nil,
                blocked: nil
            )
        }
        return noop(frameId: nil)
    }

    static func decodeAgentFrame(_ data: Data) -> CopilotStreamEvent {
        guard let frame = try? JSON.decoder.decode(AgentResponseFrame.self, from: data) else {
            return noop(frameId: nil)
        }

        if frame.type != "cf_agent_use_chat_response" {
            return messageEnd(frameId: frame.id)
        }

        if frame.error == true {
            return CopilotStreamEvent(
                type: "error",
                message: nil,
                messageId: frame.id,
                text: nil,
                usageTokens: nil,
                status: nil,
                toolCallId: nil,
                ok: nil,
                error: CopilotToolError(code: "agent_error", message: frame.body ?? "Copilot hit an error."),
                approvalId: nil,
                toolName: nil,
                title: nil,
                description: nil,
                blocked: nil
            )
        }

        if frame.done == true {
            return messageEnd(frameId: frame.id)
        }

        guard let body = frame.body, !body.isEmpty, let bodyData = body.data(using: .utf8) else {
            return noop(frameId: frame.id)
        }

        guard let chunk = parseChunkDictionary(bodyData) else {
            return noop(frameId: frame.id)
        }

        return mapChunk(chunk, frameId: frame.id)
    }

    private static func parseChunkDictionary(_ data: Data) -> [String: Any]? {
        guard let object = try? JSONSerialization.jsonObject(with: data),
              let dictionary = object as? [String: Any] else {
            return nil
        }
        return dictionary
    }

    private static func stringValue(_ dictionary: [String: Any], _ key: String) -> String? {
        dictionary[key] as? String
    }

    private static func mapChunk(_ chunk: [String: Any], frameId: String?) -> CopilotStreamEvent {
        guard let type = stringValue(chunk, "type") else {
            return noop(frameId: frameId)
        }

        let chunkId = stringValue(chunk, "id")
        let delta = stringValue(chunk, "delta")
        let text = stringValue(chunk, "text")
        let toolName = stringValue(chunk, "toolName")
        let toolCallId = stringValue(chunk, "toolCallId")

        switch type {
        case "text-delta":
            return CopilotStreamEvent(
                type: "text_delta",
                message: nil,
                messageId: chunkId ?? frameId ?? "assistant",
                text: delta ?? text ?? "",
                usageTokens: nil,
                status: nil,
                toolCallId: nil,
                ok: nil,
                error: nil,
                approvalId: nil,
                toolName: nil,
                title: nil,
                description: nil,
                blocked: nil
            )
        case "tool-input-start", "tool-input-available":
            let resolvedToolCallId = toolCallId ?? chunkId ?? UUID().uuidString
            let resolvedToolName = toolName ?? "tool"
            return CopilotStreamEvent(
                type: "tool_start",
                message: nil,
                messageId: nil,
                text: nil,
                usageTokens: nil,
                status: CopilotToolStatus(
                    toolCallId: resolvedToolCallId,
                    toolName: resolvedToolName,
                    label: resolvedToolName
                ),
                toolCallId: nil,
                ok: nil,
                error: nil,
                approvalId: nil,
                toolName: nil,
                title: nil,
                description: nil,
                blocked: nil
            )
        case "approval-requested":
            let resolvedToolCallId = toolCallId ?? chunkId ?? UUID().uuidString
            let resolvedToolName = toolName ?? "Copilot action"
            return CopilotStreamEvent(
                type: "approval_request",
                message: nil,
                messageId: nil,
                text: nil,
                usageTokens: nil,
                status: nil,
                toolCallId: nil,
                ok: nil,
                error: nil,
                approvalId: resolvedToolCallId,
                toolName: resolvedToolName,
                title: "Confirm action",
                description: "Copilot wants to run \(resolvedToolName).",
                blocked: nil
            )
        case "tool-output-available", "tool-output-error", "tool-output-denied":
            return CopilotStreamEvent(
                type: "tool_end",
                message: nil,
                messageId: nil,
                text: nil,
                usageTokens: nil,
                status: nil,
                toolCallId: toolCallId ?? chunkId,
                ok: type == "tool-output-available",
                error: nil,
                approvalId: nil,
                toolName: nil,
                title: nil,
                description: nil,
                blocked: nil
            )
        case "finish":
            return messageEnd(frameId: frameId)
        case "start", "text-start", "text-end", "start-step", "finish-step", "tool-input-delta":
            return noop(frameId: frameId)
        default:
            return noop(frameId: frameId)
        }
    }

    private static func noop(frameId: String?) -> CopilotStreamEvent {
        CopilotStreamEvent(
            type: "noop",
            message: nil,
            messageId: frameId,
            text: nil,
            usageTokens: nil,
            status: nil,
            toolCallId: nil,
            ok: nil,
            error: nil,
            approvalId: nil,
            toolName: nil,
            title: nil,
            description: nil,
            blocked: nil
        )
    }

    private static func messageEnd(frameId: String?) -> CopilotStreamEvent {
        CopilotStreamEvent(
            type: "message_end",
            message: nil,
            messageId: frameId,
            text: nil,
            usageTokens: nil,
            status: nil,
            toolCallId: nil,
            ok: nil,
            error: nil,
            approvalId: nil,
            toolName: nil,
            title: nil,
            description: nil,
            blocked: nil
        )
    }
}

private struct AgentFrameProbe: Decodable {
    let type: String
}

private struct AgentResponseFrame: Decodable {
    let type: String
    let id: String?
    let body: String?
    let done: Bool?
    let error: Bool?
}
