import Foundation

@MainActor
protocol AskSocketClient: AnyObject {
    var conversationId: String { get }

    func events() -> AsyncStream<CopilotStreamEvent>
    func connect() async throws
    func send(_ messages: [CopilotMessage], modelPreset: String) async throws -> String
    func approve(_ approvalId: String, approved: Bool) async throws
    /// Cancel every in-flight request. The client also includes ids it has
    /// already observed, so a continuation id is not missed.
    func cancel(requestIds: [String]) async throws
    func newConversation()
    func disconnect()
}

@MainActor
final class AskWebSocketClient: AskSocketClient {
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
    private let eventsStream: AsyncStream<CopilotStreamEvent>
    private let eventsContinuation: AsyncStream<CopilotStreamEvent>.Continuation
    private var task: URLSessionWebSocketTask?
    private var activeRequestId: String?
    private var continuationRequestId: String?
    private var ignoresReceiveErrors = false
    private(set) var conversationId: String

    init(auth: AuthManager, conversationId: String = UUID().uuidString) {
        self.auth = auth
        self.conversationId = conversationId
        var continuation: AsyncStream<CopilotStreamEvent>.Continuation!
        eventsStream = AsyncStream { cont in
            continuation = cont
        }
        eventsContinuation = continuation
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
    }

    func events() -> AsyncStream<CopilotStreamEvent> {
        eventsStream
    }

    func connect() async throws {
        disconnect()
        ignoresReceiveErrors = false
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

    func send(_ messages: [CopilotMessage], modelPreset: String = "fast") async throws -> String {
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
        let bodyPayload = AgentChatRequestBody(
            messages: uiMessages,
            trigger: "submit-message",
            modelPreset: modelPreset
        )
        let bodyData = try JSON.encoder.encode(bodyPayload)
        guard let bodyString = String(data: bodyData, encoding: .utf8) else {
            throw ClientError.invalidMessage
        }
        let requestId = UUID().uuidString
        let payload = AgentUseChatRequestPayload(
            id: requestId,
            requestInit: AgentRequestInit(method: "POST", body: bodyString)
        )
        let data = try JSON.encoder.encode(payload)
        guard let json = String(data: data, encoding: .utf8) else {
            throw ClientError.invalidMessage
        }
        activeRequestId = requestId
        continuationRequestId = nil
        do {
            try await task.send(.string(json))
        } catch {
            if activeRequestId == requestId {
                activeRequestId = nil
            }
            throw error
        }
        return requestId
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

    func cancel(requestIds: [String]) async throws {
        guard let task else { throw ClientError.notConnected }
        let ids = CopilotTranscript.unionCancelRequestIds(
            requested: requestIds,
            activeRequestId: activeRequestId,
            continuationRequestId: continuationRequestId
        )
        guard !ids.isEmpty else { return }
        var firstError: Error?
        for id in ids {
            let payload = AgentChatRequestCancelPayload(id: id)
            let data = try JSON.encoder.encode(payload)
            guard let json = String(data: data, encoding: .utf8) else {
                throw ClientError.invalidMessage
            }
            do {
                try await task.send(.string(json))
            } catch {
                firstError = firstError ?? error
            }
        }
        if let firstError { throw firstError }
    }

    func newConversation() {
        conversationId = UUID().uuidString
        disconnect()
    }

    func disconnect() {
        ignoresReceiveErrors = true
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        activeRequestId = nil
        continuationRequestId = nil
    }

    private func receiveLoop() async {
        guard let task else { return }
        do {
            while self.task === task {
                let message = try await task.receive()
                let event = decode(message)
                if event.type == "stream_resuming" {
                    if let ack = CopilotTranscript.resumeAck(eventType: event.type, id: event.messageId) {
                        continuationRequestId = ack.id
                        await sendResumeAck(ack)
                    }
                }
                if event.type != "noop" {
                    clearActiveRequestIfTerminal(event, message: message)
                    eventsContinuation.yield(event)
                }
            }
        } catch {
            guard self.task === task else { return }
            activeRequestId = nil
            continuationRequestId = nil
            self.task = nil
            // Intentional disconnect (background / new chat) must not buffer a
            // socket_closed error into the AsyncStream for a later observe().
            guard !ignoresReceiveErrors else { return }
            eventsContinuation.yield(
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

    private func clearActiveRequestIfTerminal(
        _ event: CopilotStreamEvent,
        message: URLSessionWebSocketTask.Message
    ) {
        guard event.type == "message_end" || event.type == "error",
              let activeRequestId else { return }

        let data: Data
        switch message {
        case .data(let incoming):
            data = incoming
        case .string(let incoming):
            data = Data(incoming.utf8)
        @unknown default:
            return
        }

        guard let envelope = try? JSON.decoder.decode(AgentResponseEnvelope.self, from: data) else {
            return
        }
        if envelope.id == continuationRequestId {
            continuationRequestId = nil
        }
        if envelope.id == activeRequestId {
            self.activeRequestId = nil
        }
    }

    private func sendResumeAck(_ ack: CopilotResumeAck) async {
        guard let task else { return }
        guard let data = try? JSON.encoder.encode(ack),
              let json = String(data: data, encoding: .utf8) else { return }
        try? await task.send(.string(json))
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

private struct AgentChatRequestCancelPayload: Encodable {
    let type = "cf_agent_chat_request_cancel"
    let id: String
}

private struct AgentResponseEnvelope: Decodable {
    let id: String?
}

private struct AgentRequestInit: Encodable {
    let method: String
    let body: String
}

private struct AgentChatRequestBody: Encodable {
    let messages: [AgentChatMessage]
    let trigger: String
    let modelPreset: String
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
