import Foundation

@MainActor
final class AskWebSocketClient {
    enum ClientError: LocalizedError {
        case notConnected
        case invalidMessage

        var errorDescription: String? {
            switch self {
            case .notConnected:
                return "Copilot is not connected."
            case .invalidMessage:
                return "Copilot sent an unsupported message."
            }
        }
    }

    private let auth: AuthManager
    private let session: URLSession
    private var task: URLSessionWebSocketTask?
    private var continuation: AsyncStream<CopilotStreamEvent>.Continuation?
    private(set) var conversationId: String

    init(auth: AuthManager, conversationId: String = UUID().uuidString) {
        self.auth = auth
        self.conversationId = conversationId
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
    }

    func events() -> AsyncStream<CopilotStreamEvent> {
        AsyncStream { continuation in
            self.continuation = continuation
        }
    }

    func connect() async throws {
        disconnect()
        let token = try await auth.validAccessToken()
        var url = AppConfig.copilotBaseURL.appending(path: conversationId)
        if url.scheme == "http" { url = URL(string: url.absoluteString.replacingOccurrences(of: "http://", with: "ws://")) ?? url }
        if url.scheme == "https" { url = URL(string: url.absoluteString.replacingOccurrences(of: "https://", with: "wss://")) ?? url }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let clientVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
        request.setValue("ios/\(clientVersion)", forHTTPHeaderField: "X-Ration-Client")

        let task = session.webSocketTask(with: request)
        self.task = task
        task.resume()
        Task { await receiveLoop() }
    }

    func send(_ messages: [CopilotMessage]) async throws {
        guard let task else { throw ClientError.notConnected }
        let payload = AgentChatMessagesPayload(
            messages: messages.map { message in
                AgentChatMessage(
                    id: message.id,
                    role: message.role,
                    parts: [AgentChatPart(type: "text", text: message.content)]
                )
            }
        )
        let data = try JSON.encoder.encode(payload)
        guard let json = String(data: data, encoding: .utf8) else {
            throw ClientError.invalidMessage
        }
        try await task.send(.string(json))
    }

    func approve(_ approvalId: String, approved: Bool) async throws {
        guard let task else { throw ClientError.notConnected }
        let payload = ApprovalResponsePayload(approvalId: approvalId, approved: approved)
        let data = try JSON.encoder.encode(payload)
        guard let json = String(data: data, encoding: .utf8) else {
            throw ClientError.invalidMessage
        }
        try await task.send(.string(json))
    }

    func newConversation() {
        conversationId = UUID().uuidString
        disconnect()
    }

    func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    private func receiveLoop() async {
        guard let task else { return }
        do {
            while self.task === task {
                let message = try await task.receive()
                let event = try decode(message)
                continuation?.yield(event)
            }
        } catch {
            continuation?.yield(
                CopilotStreamEvent(
                    type: "error",
                    message: nil,
                    messageId: nil,
                    text: nil,
                    usageTokens: nil,
                    status: nil,
                    toolCallId: nil,
                    ok: nil,
                    error: CopilotToolError(code: "socket_closed", message: error.localizedDescription),
                    approvalId: nil,
                    toolName: nil,
                    title: nil,
                    description: nil,
                    blocked: nil
                )
            )
        }
    }

    private func decode(_ message: URLSessionWebSocketTask.Message) throws -> CopilotStreamEvent {
        let data: Data
        switch message {
        case .data(let incoming):
            data = incoming
        case .string(let incoming):
            data = Data(incoming.utf8)
        @unknown default:
            throw ClientError.invalidMessage
        }

        if let frame = try? JSON.decoder.decode(AgentFrameProbe.self, from: data),
           frame.type.hasPrefix("cf_agent_") {
            return try decodeAgentFrame(data)
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
                error: CopilotToolError(code: "invalid_message", message: "Copilot sent an unsupported message: \(text.prefix(80))"),
                approvalId: nil,
                toolName: nil,
                title: nil,
                description: nil,
                blocked: nil
            )
        }
        throw ClientError.invalidMessage
    }

    private func decodeAgentFrame(_ data: Data) throws -> CopilotStreamEvent {
        let frame = try JSON.decoder.decode(AgentResponseFrame.self, from: data)
        if frame.type != "cf_agent_use_chat_response" {
            return CopilotStreamEvent(type: "message_end", message: nil, messageId: frame.id, text: nil, usageTokens: nil, status: nil, toolCallId: nil, ok: nil, error: nil, approvalId: nil, toolName: nil, title: nil, description: nil, blocked: nil)
        }
        if frame.error == true {
            return CopilotStreamEvent(type: "error", message: nil, messageId: frame.id, text: nil, usageTokens: nil, status: nil, toolCallId: nil, ok: nil, error: CopilotToolError(code: "agent_error", message: frame.body ?? "Copilot hit an error."), approvalId: nil, toolName: nil, title: nil, description: nil, blocked: nil)
        }
        guard let body = frame.body, let bodyData = body.data(using: .utf8) else {
            return CopilotStreamEvent(type: "message_end", message: nil, messageId: frame.id, text: nil, usageTokens: nil, status: nil, toolCallId: nil, ok: nil, error: nil, approvalId: nil, toolName: nil, title: nil, description: nil, blocked: nil)
        }
        let chunk = try JSON.decoder.decode(AgentChunk.self, from: bodyData)
        switch chunk.type {
        case "text-delta":
            return CopilotStreamEvent(type: "text_delta", message: nil, messageId: chunk.id ?? frame.id ?? "assistant", text: chunk.delta ?? chunk.text ?? "", usageTokens: nil, status: nil, toolCallId: nil, ok: nil, error: nil, approvalId: nil, toolName: nil, title: nil, description: nil, blocked: nil)
        case "tool-input-start", "tool-input-available":
            return CopilotStreamEvent(type: "tool_start", message: nil, messageId: nil, text: nil, usageTokens: nil, status: CopilotToolStatus(toolCallId: chunk.toolCallId ?? chunk.id ?? UUID().uuidString, toolName: chunk.toolName ?? "tool", label: chunk.toolName ?? "Running tool"), toolCallId: nil, ok: nil, error: nil, approvalId: nil, toolName: nil, title: nil, description: nil, blocked: nil)
        case "approval-requested":
            let toolCallId = chunk.toolCallId ?? chunk.id ?? UUID().uuidString
            let toolName = chunk.toolName ?? "Copilot action"
            return CopilotStreamEvent(type: "approval_request", message: nil, messageId: nil, text: nil, usageTokens: nil, status: nil, toolCallId: nil, ok: nil, error: nil, approvalId: toolCallId, toolName: toolName, title: "Confirm action", description: "Copilot wants to run \(toolName).", blocked: nil)
        case "tool-output-available", "tool-output-error", "tool-output-denied":
            return CopilotStreamEvent(type: "tool_end", message: nil, messageId: nil, text: nil, usageTokens: nil, status: nil, toolCallId: chunk.toolCallId ?? chunk.id, ok: chunk.type == "tool-output-available", error: nil, approvalId: nil, toolName: nil, title: nil, description: nil, blocked: nil)
        case "finish":
            return CopilotStreamEvent(type: "message_end", message: nil, messageId: frame.id, text: nil, usageTokens: nil, status: nil, toolCallId: nil, ok: nil, error: nil, approvalId: nil, toolName: nil, title: nil, description: nil, blocked: nil)
        default:
            return CopilotStreamEvent(type: "message_end", message: nil, messageId: frame.id, text: nil, usageTokens: nil, status: nil, toolCallId: nil, ok: nil, error: nil, approvalId: nil, toolName: nil, title: nil, description: nil, blocked: nil)
        }
    }
}

private struct ApprovalResponsePayload: Encodable {
    let type = "cf_agent_tool_approval"
    let toolCallId: String
    let approved: Bool
    let autoContinue = true

    init(approvalId: String, approved: Bool) {
        self.toolCallId = approvalId
        self.approved = approved
    }
}

private struct AgentChatMessagesPayload: Encodable {
    let type = "cf_agent_chat_messages"
    let messages: [AgentChatMessage]
}

private struct AgentChatMessage: Encodable {
    let id: String
    let role: String
    let parts: [AgentChatPart]
}

private struct AgentChatPart: Encodable {
    let type: String
    let text: String
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

private struct AgentChunk: Decodable {
    let type: String
    let id: String?
    let delta: String?
    let text: String?
    let toolName: String?
    let toolCallId: String?
}
