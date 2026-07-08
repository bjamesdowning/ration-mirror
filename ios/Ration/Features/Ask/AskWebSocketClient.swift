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
        // Think is server-authoritative: submitting a turn uses the AI SDK
        // "use chat request" envelope (a POST with the messages in the body),
        // not a flat "cf_agent_chat_messages" transcript overwrite (ignored by
        // the server).
        let uiMessages = messages.map { message in
            AgentChatMessage(
                id: message.id,
                role: message.role,
                parts: [AgentChatPart(type: "text", text: message.content)]
            )
        }
        let bodyPayload = AgentChatRequestBody(messages: uiMessages, trigger: "submit-message")
        let bodyData = try JSON.encoder.encode(bodyPayload)
        guard let bodyString = String(data: bodyData, encoding: .utf8) else {
            throw ClientError.invalidMessage
        }
        let payload = AgentUseChatRequestPayload(
            id: UUID().uuidString,
            requestInit: AgentRequestInit(method: "POST", body: bodyString)
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
                let event = decode(message)
                if event.type != "noop" {
                    continuation?.yield(event)
                }
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

    private func decode(_ message: URLSessionWebSocketTask.Message) -> CopilotStreamEvent {
        let data: Data
        switch message {
        case .data(let incoming):
            data = incoming
        case .string(let incoming):
            data = Data(incoming.utf8)
        @unknown default:
            return CopilotStreamEvent(
                type: "error",
                message: nil,
                messageId: nil,
                text: nil,
                usageTokens: nil,
                status: nil,
                toolCallId: nil,
                ok: nil,
                error: CopilotToolError(code: "invalid_message", message: ClientError.invalidMessage.errorDescription ?? "Unsupported message."),
                approvalId: nil,
                toolName: nil,
                title: nil,
                description: nil,
                blocked: nil
            )
        }

        return CopilotWebSocketDecoder.decode(data: data)
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

private struct AgentUseChatRequestPayload: Encodable {
    let type = "cf_agent_use_chat_request"
    let id: String
    let requestInit: AgentRequestInit

    enum CodingKeys: String, CodingKey {
        case type
        case id
        case requestInit = "init"
    }
}

private struct AgentRequestInit: Encodable {
    let method: String
    let body: String
}

private struct AgentChatRequestBody: Encodable {
    let messages: [AgentChatMessage]
    let trigger: String
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
