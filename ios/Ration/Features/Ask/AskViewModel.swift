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

    enum TurnPhase: Equatable {
        case idle
        case connecting
        case thinking
        case toolRunning
        case toolDone
        case streaming
    }

    struct Snapshot: Codable {
        let conversationId: String
        let messages: [CopilotMessage]
    }

    struct CompletedTool: Equatable {
        let toolName: String
        let label: String
        let succeeded: Bool
    }

    private(set) var state: State = .idle
    private(set) var turnPhase: TurnPhase = .idle
    private(set) var messages: [CopilotMessage] = []
    private(set) var status: CopilotStatusResponse?
    private(set) var activeTool: CopilotToolStatus?
    private(set) var completedTool: CompletedTool?
    private(set) var lastSyncedLabel: String?

    private var socket: AskWebSocketClient?
    private var streamTask: Task<Void, Never>?
    private var toolLingerTask: Task<Void, Never>?
    private var isConnected = false
    private var isSending = false
    private var organizationId: String?
    private var snapshots: SnapshotStore?

    var showsThinkingIndicator: Bool {
        if completedTool != nil { return false }
        switch turnPhase {
        case .connecting, .thinking, .toolRunning:
            return true
        case .streaming:
            guard let last = messages.last, last.role == "assistant" else { return true }
            return last.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .toolDone, .idle:
            return false
        }
    }

    func load(api: RationAPI, auth: AuthManager, organizationId: String, snapshots: SnapshotStore) async {
        let orgChanged = self.organizationId != organizationId
        if orgChanged {
            disconnect()
            messages = []
            activeTool = nil
            completedTool = nil
            state = .idle
            turnPhase = .idle
            lastSyncedLabel = nil
        }

        self.organizationId = organizationId
        self.snapshots = snapshots

        if let cached = snapshots.load(Snapshot.self, domain: SnapshotDomain.ask, organizationId: organizationId) {
            messages = cached.payload.messages
            socket = AskWebSocketClient(auth: auth, conversationId: cached.payload.conversationId)
            lastSyncedLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.ask, organizationId: organizationId)
        } else {
            socket = AskWebSocketClient(auth: auth)
        }

        do {
            status = try await api.copilotStatus()
            if let syncedAt = snapshots.syncedAt(domain: SnapshotDomain.ask, organizationId: organizationId),
               let status,
               Date().timeIntervalSince(syncedAt) * 1000 > Double(status.sessionIdleMs) {
                snapshots.clear(domain: SnapshotDomain.ask, organizationId: organizationId)
                messages = []
                socket = AskWebSocketClient(auth: auth)
                lastSyncedLabel = nil
            }
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
        turnPhase = .connecting
        state = .connecting
        do {
            try await socket.connect()
            isConnected = true
            state = .idle
            turnPhase = .idle
            observe(socket)
        } catch {
            isConnected = false
            turnPhase = .idle
            state = .error(error.localizedDescription)
        }
    }

    func send(_ text: String, api: RationAPI, auth: AuthManager, organizationId: String, snapshots: SnapshotStore) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSending else { return }
        self.organizationId = organizationId
        self.snapshots = snapshots

        if let status,
           status.tier == "crew_member",
           status.freeConversationsRemaining <= 0,
           !status.autoDeductConsent {
            state = .allowanceExhausted("Your Crew allowance is used. Confirm once to let Copilot use the shared credit balance for future chats.")
            turnPhase = .idle
            return
        }
        if socket == nil {
            socket = AskWebSocketClient(auth: auth)
        }
        guard let socket else { return }

        do {
            isSending = true
            turnPhase = .connecting
            if !isConnected {
                try await socket.connect()
                isConnected = true
                observe(socket)
            }
            clearTransientError()
            messages.append(CopilotMessage(role: "user", content: trimmed))
            state = .streaming
            turnPhase = .thinking
            activeTool = nil
            completedTool = nil
            try await socket.send(messages)
            persistSnapshot()
        } catch {
            isSending = false
            turnPhase = .idle
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
            turnPhase = .thinking
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    func newChat(auth: AuthManager, organizationId: String, snapshots: SnapshotStore) {
        socket?.newConversation()
        socket = AskWebSocketClient(auth: auth)
        isConnected = false
        isSending = false
        messages = []
        activeTool = nil
        completedTool = nil
        toolLingerTask?.cancel()
        state = .idle
        turnPhase = .idle
        snapshots.clear(domain: SnapshotDomain.ask, organizationId: organizationId)
        lastSyncedLabel = nil
    }

    func disconnect() {
        streamTask?.cancel()
        streamTask = nil
        toolLingerTask?.cancel()
        toolLingerTask = nil
        socket?.disconnect()
        isConnected = false
    }

    private func observe(_ socket: AskWebSocketClient) {
        streamTask?.cancel()
        streamTask = Task { [weak self] in
            for await event in socket.events() {
                self?.apply(event)
            }
        }
    }

    func apply(_ event: CopilotStreamEvent) {
        switch event.type {
        case "message_start":
            if let message = event.message {
                if message.role == "assistant" {
                    if let index = messages.lastIndex(where: { $0.role == "assistant" && $0.id == message.id }) {
                        if messages[index].content.isEmpty {
                            messages[index] = message
                        }
                    } else if messages.last?.role != "assistant" {
                        messages.append(message)
                    }
                } else if !messages.contains(where: { $0.id == message.id }) {
                    messages.append(message)
                }
            }
            turnPhase = .thinking
        case "text_delta":
            let text = event.text ?? ""
            if let index = messages.lastIndex(where: { $0.role == "assistant" }) {
                messages[index].content += text
            } else {
                messages.append(CopilotMessage(id: event.messageId ?? UUID().uuidString, role: "assistant", content: text))
            }
            clearTransientError()
            state = .streaming
            turnPhase = .streaming
            persistSnapshot()
        case "message_end":
            activeTool = nil
            clearTransientError()
            state = .idle
            turnPhase = .idle
            isSending = false
            persistSnapshot()
        case "tool_start":
            if let status = event.status {
                activeTool = CopilotToolStatus(
                    toolCallId: status.toolCallId,
                    toolName: status.toolName,
                    label: CopilotToolLabels.label(for: status.toolName, phase: .running)
                )
            }
            completedTool = nil
            toolLingerTask?.cancel()
            state = .streaming
            turnPhase = .toolRunning
        case "tool_end":
            let toolName = activeTool?.toolName ?? "tool"
            let succeeded = event.ok ?? true
            activeTool = nil
            completedTool = CompletedTool(
                toolName: toolName,
                label: CopilotToolLabels.label(for: toolName, phase: succeeded ? .done : .error),
                succeeded: succeeded
            )
            turnPhase = .thinking
            toolLingerTask?.cancel()
            toolLingerTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 800_000_000)
                guard !Task.isCancelled else { return }
                guard let self else { return }
                if self.completedTool?.toolName == toolName {
                    self.completedTool = nil
                }
            }
            persistSnapshot()
        case "approval_request":
            isSending = false
            turnPhase = .idle
            state = .awaitingApproval(
                id: event.approvalId ?? UUID().uuidString,
                title: event.title ?? "Confirm action",
                description: event.description ?? "Ration Copilot needs your confirmation."
            )
        case "blocked_feature":
            isSending = false
            turnPhase = .idle
            if let blocked = event.blocked {
                state = .blocked(blocked)
            }
        case "error":
            isConnected = false
            isSending = false
            turnPhase = .idle
            state = .error(event.error?.message ?? event.text ?? "Copilot hit an error.")
        default:
            break
        }
    }

    private func persistSnapshot() {
        guard let organizationId, let snapshots else { return }
        let conversationId = socket?.conversationId ?? UUID().uuidString
        snapshots.save(
            Snapshot(conversationId: conversationId, messages: messages),
            domain: SnapshotDomain.ask,
            organizationId: organizationId
        )
        lastSyncedLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.ask, organizationId: organizationId)
    }

    private func clearTransientError() {
        if case .error = state {
            state = .idle
        }
    }
}
