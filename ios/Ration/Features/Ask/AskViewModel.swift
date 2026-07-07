import Foundation
import Observation

@MainActor
@Observable
final class AskViewModel {
    enum State: Equatable {
        case idle
        case connecting
        case streaming
        case awaitingApproval(id: String, title: String, description: String)
        case blocked(CopilotBlockedFeature)
        case allowanceExhausted(String)
        case error(String)
    }

    struct Snapshot: Codable {
        let conversationId: String
        let messages: [CopilotMessage]
    }

    private(set) var state: State = .idle
    private(set) var messages: [CopilotMessage] = []
    private(set) var status: CopilotStatusResponse?
    private(set) var activeTool: CopilotToolStatus?
    private(set) var lastSyncedLabel: String?

    private var socket: AskWebSocketClient?
    private var streamTask: Task<Void, Never>?
    private var isConnected = false

    func load(api: RationAPI, auth: AuthManager, organizationId: String, snapshots: SnapshotStore) async {
        if let cached = snapshots.load(Snapshot.self, domain: SnapshotDomain.ask, organizationId: organizationId) {
            messages = cached.payload.messages
            socket = AskWebSocketClient(auth: auth, conversationId: cached.payload.conversationId)
            lastSyncedLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.ask, organizationId: organizationId)
        } else {
            socket = AskWebSocketClient(auth: auth)
        }

        do {
            status = try await api.copilotStatus()
        } catch {
            isConnected = false
            state = .error((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func connectIfNeeded(auth: AuthManager) async {
        if socket == nil {
            socket = AskWebSocketClient(auth: auth)
        }
        guard let socket else { return }
        state = .connecting
        do {
            try await socket.connect()
            isConnected = true
            state = .idle
            observe(socket)
        } catch {
            isConnected = false
            state = .error(error.localizedDescription)
        }
    }

    func send(_ text: String, api: RationAPI, auth: AuthManager, organizationId: String, snapshots: SnapshotStore) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if let status,
           status.tier == "crew_member",
           status.freeConversationsRemaining <= 0,
           !status.autoDeductConsent {
            state = .allowanceExhausted("Your Crew allowance is used. Confirm once to let Copilot use the shared credit balance for future chats.")
            return
        }
        if socket == nil {
            socket = AskWebSocketClient(auth: auth)
        }
        guard let socket else { return }

        do {
            if !isConnected {
                try await socket.connect()
                isConnected = true
                observe(socket)
            }
            messages.append(CopilotMessage(role: "user", content: trimmed))
            state = .streaming
            try await socket.send(messages)
            save(organizationId: organizationId, snapshots: snapshots)
        } catch {
            state = .error((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func enableAutoDeduct(api: RationAPI) async {
        do {
            status = try await api.updateCopilotConsent(autoDeductConsent: true)
            state = .idle
        } catch {
            state = .error((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func approve(_ approvalId: String, approved: Bool) async {
        do {
            try await socket?.approve(approvalId, approved: approved)
            state = .streaming
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    func newChat(auth: AuthManager, organizationId: String, snapshots: SnapshotStore) {
        socket?.newConversation()
        socket = AskWebSocketClient(auth: auth)
        isConnected = false
        messages = []
        activeTool = nil
        state = .idle
        save(organizationId: organizationId, snapshots: snapshots)
    }

    func disconnect() {
        streamTask?.cancel()
        streamTask = nil
        socket?.disconnect()
        isConnected = false
    }

    private func observe(_ socket: AskWebSocketClient) {
        streamTask?.cancel()
        streamTask = Task { [weak self] in
            for await event in socket.events() {
                await self?.apply(event)
            }
        }
    }

    func apply(_ event: CopilotStreamEvent) {
        switch event.type {
        case "message_start":
            if let message = event.message {
                messages.append(message)
            }
        case "text_delta":
            let text = event.text ?? ""
            if let index = messages.lastIndex(where: { $0.role == "assistant" }) {
                messages[index].content += text
            } else {
                messages.append(CopilotMessage(id: event.messageId ?? UUID().uuidString, role: "assistant", content: text))
            }
            state = .streaming
        case "message_end":
            activeTool = nil
            state = .idle
        case "tool_start":
            activeTool = event.status
            state = .streaming
        case "tool_end":
            activeTool = nil
        case "approval_request":
            state = .awaitingApproval(
                id: event.approvalId ?? UUID().uuidString,
                title: event.title ?? "Confirm action",
                description: event.description ?? "Ration Copilot needs your confirmation."
            )
        case "blocked_feature":
            if let blocked = event.blocked {
                state = .blocked(blocked)
            }
        case "error":
            isConnected = false
            state = .error(event.error?.message ?? event.text ?? "Copilot hit an error.")
        default:
            break
        }
    }

    private func save(organizationId: String, snapshots: SnapshotStore) {
        let conversationId = socket?.conversationId ?? UUID().uuidString
        snapshots.save(
            Snapshot(conversationId: conversationId, messages: messages),
            domain: SnapshotDomain.ask,
            organizationId: organizationId
        )
        lastSyncedLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.ask, organizationId: organizationId)
    }
}
