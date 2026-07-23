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
            return noop(frameId: frame.id)
        }

        if frame.error?.isError == true {
            return CopilotStreamEvent(
                type: "error",
                message: nil,
                messageId: frame.id,
                text: nil,
                usageTokens: nil,
                status: nil,
                toolCallId: nil,
                ok: nil,
                error: CopilotToolError(
                    code: "agent_error",
                    message: frame.error?.message ?? frame.body ?? "Copilot hit an error."
                ),
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

    /// Matches web `isStructuredCopilotToolFailure` — tool execute returns
    /// `{ ok: false, error: { code, message } }` on failure instead of throwing.
    private static func isStructuredToolFailure(_ output: Any?) -> Bool {
        guard let dictionary = output as? [String: Any],
              dictionary["ok"] as? Bool == false,
              let error = dictionary["error"] as? [String: Any],
              error["code"] is String,
              error["message"] is String
        else {
            return false
        }
        return true
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
        case "reasoning-start":
            return CopilotStreamEvent(
                type: "reasoning_start",
                message: nil,
                messageId: chunkId ?? frameId ?? "assistant",
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
        case "reasoning-delta":
            return CopilotStreamEvent(
                type: "reasoning_delta",
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
        case "reasoning-end":
            return CopilotStreamEvent(
                type: "reasoning_end",
                message: nil,
                messageId: chunkId ?? frameId ?? "assistant",
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
        case "tool-approval-request", "approval-requested":
            // AI SDK UI stream emits `tool-approval-request` with approvalId +
            // toolCallId. `approval-requested` is the tool part *state* (legacy
            // alias). Approve via cf_agent_tool_approval using toolCallId.
            let resolvedToolCallId: String?
            if let toolCallId, !toolCallId.isEmpty {
                resolvedToolCallId = toolCallId
            } else if type == "approval-requested" {
                resolvedToolCallId = chunkId
            } else {
                resolvedToolCallId = nil
            }
            guard let approvalToolCallId = resolvedToolCallId, !approvalToolCallId.isEmpty else {
                return CopilotStreamEvent(
                    type: "error",
                    message: nil,
                    messageId: frameId,
                    text: nil,
                    usageTokens: nil,
                    status: nil,
                    toolCallId: nil,
                    ok: nil,
                    error: CopilotToolError(
                        code: "invalid_approval",
                        message: "Copilot sent an approval request without a toolCallId."
                    ),
                    approvalId: nil,
                    toolName: nil,
                    title: nil,
                    description: nil,
                    blocked: nil
                )
            }
            let resolvedToolName = toolName
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
                approvalId: approvalToolCallId,
                toolName: resolvedToolName,
                title: "Confirm \(resolvedToolName ?? "action")",
                description: resolvedToolName.map { "Copilot wants to run \($0)." } ?? "Copilot wants to run a tool action.",
                blocked: nil
            )
        case "tool-output-available":
            let succeeded = !isStructuredToolFailure(chunk["output"])
            return CopilotStreamEvent(
                type: "tool_end",
                message: nil,
                messageId: nil,
                text: nil,
                usageTokens: nil,
                status: nil,
                toolCallId: toolCallId ?? chunkId,
                ok: succeeded,
                error: nil,
                approvalId: nil,
                toolName: nil,
                title: nil,
                description: nil,
                blocked: nil
            )
        case "tool-output-error", "tool-output-denied":
            return CopilotStreamEvent(
                type: "tool_end",
                message: nil,
                messageId: nil,
                text: nil,
                usageTokens: nil,
                status: nil,
                toolCallId: toolCallId ?? chunkId,
                ok: false,
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
    let error: AgentFrameError?
}

private enum AgentFrameError: Decodable {
    case flag(Bool)
    case detail(String?)

    var isError: Bool {
        switch self {
        case .flag(let value):
            return value
        case .detail:
            return true
        }
    }

    var message: String? {
        if case .detail(let message) = self {
            return message
        }
        return nil
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let flag = try? container.decode(Bool.self) {
            self = .flag(flag)
            return
        }
        let detail = try container.decode(ErrorDetail.self)
        self = .detail(detail.message)
    }
}

private struct ErrorDetail: Decodable {
    let message: String?
}
