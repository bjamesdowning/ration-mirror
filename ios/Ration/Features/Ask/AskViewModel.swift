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

    struct Snapshot: Codable, Sendable {
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
    private(set) var isTurnActive = false
    private(set) var isStopping = false
    private(set) var isAwaitingApproval = false
    private(set) var briefingComplete = false
    var tracksBriefingSession = false

    private var socket: (any AskSocketClient)?
    private var streamTask: Task<Void, Never>?
    private var toolLingerTask: Task<Void, Never>?
    private var snapshotSaveTask: Task<Void, Never>?
    private var stopTimeoutTask: Task<Void, Never>?
    private var isConnected = false
    private var isSubmitting = false
    private var organizationId: String?
    private var snapshots: SnapshotStore?
    private let stopTimeoutNanoseconds: UInt64

    init(
        socket: (any AskSocketClient)? = nil,
        stopTimeoutNanoseconds: UInt64 = 2_000_000_000
    ) {
        self.socket = socket
        self.stopTimeoutNanoseconds = stopTimeoutNanoseconds
    }

    var activityDisplay: CopilotActivityDisplay {
        CopilotActivityDisplayResolver.resolve(
            turnPhase: turnPhase,
            isTurnActive: isTurnActive,
            activeToolName: activeTool?.toolName,
            completedTool: completedTool,
            messages: messages
        )
    }

    /// Last assistant message content length — drives scroll-to-bottom during streaming.
    var streamingContentLength: Int {
        guard messages.last?.role == "assistant" else { return 0 }
        return messages.last?.content.count ?? 0
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
        if !orgChanged, socket != nil {
            do {
                status = try await api.copilotStatus()
            } catch {
                if !isTurnActive {
                    state = .error((error as? APIError)?.errorDescription ?? error.localizedDescription)
                }
            }
            return
        }

        if let cached = await snapshots.load(Snapshot.self, domain: SnapshotDomain.ask, organizationId: organizationId) {
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
                await snapshots.clear(domain: SnapshotDomain.ask, organizationId: organizationId)
                messages = []
                socket = AskWebSocketClient(auth: auth)
                lastSyncedLabel = nil
            }
        } catch {
            isConnected = false
            state = .error((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func resetBriefingSession() {
        tracksBriefingSession = false
        briefingComplete = false
    }

    func showStaticBriefing(_ markdown: String) {
        messages = [
            CopilotMessage(role: "user", content: OnboardingBriefingCopy.bootstrapPrompt),
            CopilotMessage(role: "assistant", content: markdown),
        ]
        briefingComplete = true
        state = .idle
        turnPhase = .idle
    }

    @discardableResult
    func send(
        _ text: String,
        api: RationAPI,
        auth: AuthManager,
        organizationId: String,
        snapshots: SnapshotStore
    ) async -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              !isSubmitting,
              !isTurnActive,
              !isAwaitingApproval,
              !briefingComplete else { return false }
        isSubmitting = true
        defer { isSubmitting = false }
        self.organizationId = organizationId
        self.snapshots = snapshots

        if let status,
           status.tier == "crew_member",
           status.freeConversationsRemaining <= 0,
           !status.autoDeductConsent {
            state = .allowanceExhausted("Your Crew allowance is used. Confirm once to let Copilot use the shared credit balance for future chats.")
            turnPhase = .idle
            return false
        }
        if socket == nil {
            socket = AskWebSocketClient(auth: auth)
        }
        guard let socket else { return false }

        do {
            turnPhase = .connecting
            beginTurn()
            state = .streaming
            if !isConnected {
                observe(socket)
                try await socket.connect()
                isConnected = true
            }
            clearTransientError()
            let userMessage = CopilotMessage(role: "user", content: trimmed)
            messages.append(userMessage)
            turnPhase = .thinking
            activeTool = nil
            completedTool = nil
            do {
                try await socket.send(messages)
            } catch {
                if messages.last?.id == userMessage.id {
                    messages.removeLast()
                }
                throw error
            }
            await persistSnapshotNow()
            return true
        } catch {
            completeTurn(
                state: .error((error as? APIError)?.errorDescription ?? error.localizedDescription)
            )
            return false
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
        guard case let .awaitingApproval(id, _, _) = state,
              id == approvalId,
              isAwaitingApproval,
              let socket else { return }
        isAwaitingApproval = false
        do {
            try await socket.approve(approvalId, approved: approved)
            if approved {
                guard !isStopping else { return }
                isTurnActive = true
                state = .streaming
                turnPhase = .thinking
            } else {
                completeTurn(state: .idle)
                scheduleImmediateSnapshotSave()
            }
        } catch {
            completeTurn(state: .error(error.localizedDescription))
        }
    }

    func stop() async {
        guard isTurnActive, !isStopping else { return }
        isStopping = true
        isAwaitingApproval = false

        guard let socket else {
            completeTurn(state: .idle)
            return
        }

        do {
            try await socket.cancelActiveRequest()
        } catch {
            completeTurn(state: .error(error.localizedDescription))
            return
        }

        stopTimeoutTask?.cancel()
        stopTimeoutTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(nanoseconds: self.stopTimeoutNanoseconds)
            guard !Task.isCancelled, self.isStopping else { return }
            self.socket?.disconnect()
            self.isConnected = false
            self.completeTurn(state: .idle)
            self.scheduleImmediateSnapshotSave()
        }
    }

    func newChat(auth: AuthManager, organizationId: String, snapshots: SnapshotStore) {
        snapshotSaveTask?.cancel()
        stopTimeoutTask?.cancel()
        stopTimeoutTask = nil
        streamTask?.cancel()
        streamTask = nil
        toolLingerTask?.cancel()
        toolLingerTask = nil

        let previousSocket = socket
        if isTurnActive {
            Task { try? await previousSocket?.cancelActiveRequest() }
        }
        previousSocket?.newConversation()

        socket = AskWebSocketClient(auth: auth)
        isConnected = false
        messages = []
        activeTool = nil
        completedTool = nil
        completeTurn(state: .idle)
        Task {
            await snapshots.clear(domain: SnapshotDomain.ask, organizationId: organizationId)
        }
        lastSyncedLabel = nil
    }

    func disconnect() {
        streamTask?.cancel()
        streamTask = nil
        toolLingerTask?.cancel()
        toolLingerTask = nil
        snapshotSaveTask?.cancel()
        snapshotSaveTask = nil
        socket?.disconnect()
        isConnected = false
        completeTurn(state: .idle)
    }

    private func observe(_ socket: any AskSocketClient) {
        streamTask?.cancel()
        streamTask = Task { [weak self] in
            for await event in socket.events() {
                guard let self, self.shouldAcceptObservedEvent(event) else { continue }
                self.apply(event)
            }
        }
    }

    func shouldAcceptObservedEvent(_ event: CopilotStreamEvent) -> Bool {
        isTurnActive || event.type == "message_end" || event.type == "error"
    }

    func apply(_ event: CopilotStreamEvent) {
        switch event.type {
        case "message_start":
            beginTurnIfNeeded()
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
            beginTurnIfNeeded()
            appendAssistantDelta(event.text ?? "", messageId: event.messageId)
            clearTransientError()
            state = .streaming
            turnPhase = .streaming
            persistSnapshotDebounced()
        case "message_end":
            clearTransientError()
            if tracksBriefingSession {
                briefingComplete = true
            }
            completeTurn(state: .idle)
            scheduleImmediateSnapshotSave()
        case "tool_start":
            beginTurnIfNeeded()
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
            let succeeded = event.ok == true
            activeTool = nil
            completedTool = CompletedTool(
                toolName: toolName,
                label: CopilotToolLabels.label(for: toolName, phase: succeeded ? .done : .error),
                succeeded: succeeded
            )
            turnPhase = .toolDone
            toolLingerTask?.cancel()
            toolLingerTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 800_000_000)
                guard !Task.isCancelled else { return }
                guard let self else { return }
                if self.completedTool?.toolName == toolName {
                    self.completedTool = nil
                    if self.isTurnActive, self.turnPhase == .toolDone {
                        self.turnPhase = .thinking
                    }
                }
            }
            scheduleImmediateSnapshotSave()
        case "approval_request":
            guard !isStopping else { return }
            beginTurnIfNeeded()
            turnPhase = .idle
            guard let approvalId = event.approvalId else {
                completeTurn(state: .error("Copilot sent an invalid approval request."))
                return
            }
            isAwaitingApproval = true
            state = .awaitingApproval(
                id: approvalId,
                title: event.title ?? "Confirm action",
                description: event.description ?? "Ration Copilot needs your confirmation."
            )
        case "blocked_feature":
            if let blocked = event.blocked {
                completeTurn(state: .blocked(blocked))
            } else {
                completeTurn(state: .error("Copilot sent an invalid blocked action."))
            }
        case "error":
            let wasTurnActive = isTurnActive
            if event.error?.code == "onboarding_briefing_exhausted" {
                briefingComplete = true
                completeTurn(state: .idle)
                return
            }
            isConnected = false
            if event.error?.code == "session_limit_reached" {
                messages = []
                activeTool = nil
                completedTool = nil
                socket?.newConversation()
                if let organizationId, let snapshots {
                    Task {
                        await snapshots.clear(domain: SnapshotDomain.ask, organizationId: organizationId)
                    }
                }
                lastSyncedLabel = nil
            } else if !wasTurnActive {
                return
            }
            completeTurn(
                state: .error(event.error?.message ?? event.text ?? "Copilot hit an error.")
            )
        default:
            break
        }
    }

    private func appendAssistantDelta(_ text: String, messageId: String?) {
        if messages.last?.role == "assistant", let index = messages.indices.last {
            messages[index].content += text
        } else {
            messages.append(
                CopilotMessage(
                    id: messageId ?? UUID().uuidString,
                    role: "assistant",
                    content: text
                )
            )
        }
    }

    private func persistSnapshotDebounced() {
        snapshotSaveTask?.cancel()
        snapshotSaveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            await self?.persistSnapshotNow()
        }
    }

    private func scheduleImmediateSnapshotSave() {
        snapshotSaveTask?.cancel()
        snapshotSaveTask = Task { [weak self] in
            guard !Task.isCancelled else { return }
            await self?.persistSnapshotNow()
        }
    }

    private func persistSnapshotNow() async {
        guard let organizationId, let snapshots else { return }
        let conversationId = socket?.conversationId ?? UUID().uuidString
        await snapshots.save(
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

    private func beginTurn() {
        stopTimeoutTask?.cancel()
        stopTimeoutTask = nil
        isTurnActive = true
        isStopping = false
        isAwaitingApproval = false
    }

    private func beginTurnIfNeeded() {
        if !isTurnActive {
            beginTurn()
        }
    }

    private func completeTurn(state: State) {
        stopTimeoutTask?.cancel()
        stopTimeoutTask = nil
        toolLingerTask?.cancel()
        toolLingerTask = nil
        activeTool = nil
        completedTool = nil
        isTurnActive = false
        isStopping = false
        isAwaitingApproval = false
        turnPhase = .idle
        self.state = state
    }
}
