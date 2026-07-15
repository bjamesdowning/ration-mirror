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
        case insufficientCredits(String)
        case sessionLimitReached(String)
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
        let modelPreset: String

        init(
            conversationId: String,
            messages: [CopilotMessage],
            modelPreset: String = "fast"
        ) {
            self.conversationId = conversationId
            self.messages = messages
            self.modelPreset = modelPreset
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            conversationId = try container.decode(String.self, forKey: .conversationId)
            messages = try container.decode([CopilotMessage].self, forKey: .messages)
            modelPreset = try container.decodeIfPresent(String.self, forKey: .modelPreset) ?? "fast"
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(conversationId, forKey: .conversationId)
            try container.encode(messages, forKey: .messages)
            try container.encode(modelPreset, forKey: .modelPreset)
        }

        enum CodingKeys: String, CodingKey {
            case conversationId
            case messages
            case modelPreset
        }
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
    private(set) var sessionUsage: CopilotSessionUsage?
    private(set) var sessionLimitWarning: CopilotSessionLimitWarning?
    private(set) var urgentWarningAcknowledged = false
    private(set) var activeTool: CopilotToolStatus?
    private(set) var completedTool: CompletedTool?
    private(set) var lastSyncedLabel: String?
    private(set) var isTurnActive = false
    private(set) var isStopping = false
    private(set) var isAwaitingApproval = false
    private(set) var briefingComplete = false
    private(set) var introComplete = false
    private(set) var seedComplete = false
    private(set) var seedTurnStarted = false
    private(set) var seedItemsAdded = 0
    var tracksBriefingSession = false
    private(set) var modelPreset: String = "fast"

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

    var blocksComposerForSessionWarning: Bool {
        sessionLimitWarning?.isUrgent == true && !urgentWarningAcknowledged
    }

    var blocksComposerForBillingState: Bool {
        switch state {
        case .sessionLimitReached, .insufficientCredits:
            return true
        default:
            return false
        }
    }

    func acknowledgeSessionLimitWarning() {
        urgentWarningAcknowledged = true
    }

    @discardableResult
    func refreshStatusAfterCredits(
        api: RationAPI,
        auth: AuthManager,
        organizationId: String,
        snapshots: SnapshotStore
    ) async -> String? {
        do {
            let nextStatus = try await api.copilotStatus()
            status = nextStatus
            if case .insufficientCredits = state,
               nextStatus.creditBalance >= nextStatus.conversationFloorCost {
                newChat(auth: auth, organizationId: organizationId, snapshots: snapshots)
                completeTurn(state: .idle)
                return CopilotContinuationCopy.continuationDraft()
            }
        } catch {
            // Keep the existing credits banner if status refresh fails.
        }
        return nil
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
            modelPreset = "fast"
            activeTool = nil
            completedTool = nil
            sessionUsage = nil
            sessionLimitWarning = nil
            urgentWarningAcknowledged = false
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
            modelPreset = cached.payload.modelPreset
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
                modelPreset = "fast"
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
        introComplete = false
        seedComplete = false
        seedTurnStarted = false
        seedItemsAdded = 0
        modelPreset = "fast"
    }

    func beginOnboardingBriefingSession() {
        tracksBriefingSession = true
        briefingComplete = false
        introComplete = false
        seedComplete = false
        seedTurnStarted = false
        seedItemsAdded = 0
        modelPreset = "deep"
    }

    func markSeedTurnStarted() {
        seedTurnStarted = true
    }

    var seedSuccessMessage: String {
        if seedItemsAdded <= 0 {
            return "Kitchen stocked in Cargo"
        }
        let noun = seedItemsAdded == 1 ? "item" : "items"
        return "\(seedItemsAdded) \(noun) added to Cargo"
    }

    func showStaticBriefing(_ markdown: String) {
        messages = [
            CopilotMessage(role: "user", content: OnboardingBriefingCopy.bootstrapPrompt),
            CopilotMessage(role: "assistant", content: markdown),
        ]
        introComplete = true
        briefingComplete = true
        seedComplete = false
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
        if case .sessionLimitReached = state { return false }
        if case .insufficientCredits = state { return false }
        if blocksComposerForSessionWarning { return false }
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
                try await socket.send(messages, modelPreset: modelPreset)
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
        modelPreset = "fast"
        activeTool = nil
        completedTool = nil
        sessionUsage = nil
        sessionLimitWarning = nil
        urgentWarningAcknowledged = false
        completeTurn(state: .idle)
        Task {
            await snapshots.clear(domain: SnapshotDomain.ask, organizationId: organizationId)
        }
        lastSyncedLabel = nil
    }

    func setModelPreset(_ preset: String) {
        guard preset == "fast" || preset == "deep" else { return }
        modelPreset = preset
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
        isTurnActive
            || event.type == "message_end"
            || event.type == "error"
            || event.type == "session_usage_update"
            || event.type == "session_limit_warning"
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
        case "reasoning_start":
            beginTurnIfNeeded()
            appendReasoningDelta("", mode: .start, messageId: event.messageId)
            turnPhase = .thinking
        case "reasoning_delta":
            beginTurnIfNeeded()
            appendReasoningDelta(event.text ?? "", mode: .delta, messageId: event.messageId)
            turnPhase = .thinking
        case "reasoning_end":
            appendReasoningDelta("", mode: .end, messageId: event.messageId)
        case "message_end":
            clearTransientError()
            if tracksBriefingSession {
                if !introComplete {
                    introComplete = true
                } else if seedTurnStarted, isTurnActive {
                    seedComplete = true
                    briefingComplete = true
                }
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
            if tracksBriefingSession, toolName == "add_cargo_item", succeeded {
                seedItemsAdded += 1
            }
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
        case "session_usage_update":
            if let usage = event.usage {
                sessionUsage = usage
                if let currentStatus = status {
                    status = CopilotStatusResponse(
                        tier: currentStatus.tier,
                        freeConversationsRemaining: currentStatus.freeConversationsRemaining,
                        allowanceResetAt: currentStatus.allowanceResetAt,
                        creditBalance: usage.creditBalance,
                        autoDeductConsent: currentStatus.autoDeductConsent,
                        conversationFloorCost: currentStatus.conversationFloorCost,
                        sessionIdleMs: currentStatus.sessionIdleMs,
                        tokensPerCredit: currentStatus.tokensPerCredit,
                        sessionMaxTokens: currentStatus.sessionMaxTokens,
                        onboardingBriefingEligible: currentStatus.onboardingBriefingEligible,
                        onboardingBriefingConsumed: currentStatus.onboardingBriefingConsumed
                    )
                }
            }
        case "session_limit_warning":
            if let warning = event.warning {
                sessionLimitWarning = warning
                if warning.isUrgent {
                    urgentWarningAcknowledged = false
                }
            }
        case "error":
            let wasTurnActive = isTurnActive
            if event.error?.code == "onboarding_briefing_exhausted"
                || event.error?.code == "onboarding_briefing_invalid_prompt" {
                if event.error?.code == "onboarding_briefing_exhausted" {
                    briefingComplete = true
                    introComplete = true
                }
                completeTurn(state: .idle)
                return
            }
            isConnected = false
            if event.error?.code == "session_limit_reached" {
                // Preserve transcript and let the user start a new chat explicitly.
                socket?.disconnect()
                completeTurn(state: .sessionLimitReached(event.error?.message ?? "This Copilot chat is full. Start a new chat to continue."))
                scheduleImmediateSnapshotSave()
                return
            }
            if event.error?.code == "insufficient_credits" {
                // Preserve transcript; user needs to add credits before continuing.
                socket?.disconnect()
                completeTurn(state: .insufficientCredits(event.error?.message ?? "Copilot needs more credits."))
                scheduleImmediateSnapshotSave()
                return
            }
            if !wasTurnActive {
                return
            }
            completeTurn(
                state: .error(event.error?.message ?? event.text ?? "Copilot hit an error.")
            )
        default:
            break
        }
    }

    private enum ReasoningAppendMode {
        case start
        case delta
        case end
    }

    private func appendReasoningDelta(
        _ text: String,
        mode: ReasoningAppendMode,
        messageId: String?
    ) {
        if messages.last?.role == "assistant", let index = messages.indices.last {
            var message = messages[index]
            switch mode {
            case .start:
                message.reasoning = message.reasoning ?? ""
                message.reasoningState = "streaming"
            case .delta:
                message.reasoning = (message.reasoning ?? "") + text
                message.reasoningState = "streaming"
            case .end:
                message.reasoningState = "complete"
            }
            messages[index] = message
            return
        }

        guard mode != .end else { return }
        messages.append(
            CopilotMessage(
                id: messageId ?? UUID().uuidString,
                role: "assistant",
                content: "",
                reasoning: mode == .delta ? text : "",
                reasoningState: "streaming"
            )
        )
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
            Snapshot(
                conversationId: conversationId,
                messages: messages,
                modelPreset: modelPreset
            ),
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
