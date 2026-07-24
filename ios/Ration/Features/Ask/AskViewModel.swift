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
        let sessionUsage: CopilotSessionUsage?
        /// Epoch ms of last user/assistant activity (not usage-only sync).
        let lastActivityAtMs: Double?

        init(
            conversationId: String,
            messages: [CopilotMessage],
            modelPreset: String = "fast",
            sessionUsage: CopilotSessionUsage? = nil,
            lastActivityAtMs: Double? = nil
        ) {
            self.conversationId = conversationId
            self.messages = messages
            self.modelPreset = modelPreset
            self.sessionUsage = sessionUsage
            self.lastActivityAtMs = lastActivityAtMs
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            conversationId = try container.decode(String.self, forKey: .conversationId)
            messages = try container.decode([CopilotMessage].self, forKey: .messages)
            modelPreset = try container.decodeIfPresent(String.self, forKey: .modelPreset) ?? "fast"
            sessionUsage = try container.decodeIfPresent(CopilotSessionUsage.self, forKey: .sessionUsage)
            lastActivityAtMs = try container.decodeIfPresent(Double.self, forKey: .lastActivityAtMs)
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(conversationId, forKey: .conversationId)
            try container.encode(messages, forKey: .messages)
            try container.encode(modelPreset, forKey: .modelPreset)
            try container.encodeIfPresent(sessionUsage, forKey: .sessionUsage)
            try container.encodeIfPresent(lastActivityAtMs, forKey: .lastActivityAtMs)
        }

        enum CodingKeys: String, CodingKey {
            case conversationId
            case messages
            case modelPreset
            case sessionUsage
            case lastActivityAtMs
        }
    }

    struct CompletedTool: Equatable {
        let toolName: String
        let label: String
        let succeeded: Bool
    }

    var state: State = .idle
    var turnPhase: TurnPhase = .idle
    var messages: [CopilotMessage] = []
    var status: CopilotStatusResponse?
    var sessionUsage: CopilotSessionUsage?
    var sessionLimitWarning: CopilotSessionLimitWarning?
    var urgentWarningAcknowledged = false
    var activeTool: CopilotToolStatus?
    var completedTool: CompletedTool?
    var lastSyncedLabel: String?
    var isTurnActive = false
    var isStopping = false
    var isAwaitingApproval = false
    /// After Approve, ignore pause-stream message_end until continuation activity.
    var expectingApprovalContinuation = false
    var seenPostApprovalActivity = false
    var pauseApprovalRequestId: String?
    var briefingComplete = false
    var introComplete = false
    /// True when the intro assistant reply had usable content (not empty / failed soft end).
    var introSucceeded = false
    var seedComplete = false
    var seedTurnStarted = false
    /// True when the welcome intro came from a live Copilot turn (not static markdown).
    var liveBriefingActive = false
    var seedItemsAdded = 0
    var tracksBriefingSession = false
    var modelPreset: String = "fast"
    /// Retained across background so resume reconnects to the same Think DO.
    var conversationId: String

    var socket: (any AskSocketClient)?
    var streamTask: Task<Void, Never>?
    var toolLingerTask: Task<Void, Never>?
    var snapshotSaveTask: Task<Void, Never>?
    private var stopTimeoutTask: Task<Void, Never>?
    private var briefingTurnTimeoutTask: Task<Void, Never>?
    private var turnWatchdogTask: Task<Void, Never>?
    var isConnected = false
    private var isSubmitting = false
    private var organizationId: String?
    private var snapshots: SnapshotStore?
    var lastActivityAt = Date()
    /// Bumped when the live socket is discarded so late events from an old
    /// observe loop cannot poison a later turn.
    var connectionGeneration = 0
    let makeSocket: @MainActor (AuthManager, String) -> any AskSocketClient
    private let stopTimeoutNanoseconds: UInt64
    private let briefingTurnTimeoutNanoseconds: UInt64
    /// 90s with no stream activity while turn is active (matches web COPILOT_TURN_WATCHDOG_MS).
    private let turnWatchdogNanoseconds: UInt64 = 90_000_000_000

    static let briefingTurnTimeoutMessage =
        "Copilot took too long. Tap retry to try again, or Get Started to continue."
    static let turnWatchdogMessage =
        "Copilot stopped responding. Please try again — the previous turn was ended to unblock chat."

    init(
        socket: (any AskSocketClient)? = nil,
        stopTimeoutNanoseconds: UInt64 = 2_000_000_000,
        briefingTurnTimeoutNanoseconds: UInt64 = 60_000_000_000,
        socketFactory: (@MainActor (AuthManager, String) -> any AskSocketClient)? = nil
    ) {
        self.makeSocket = socketFactory ?? { auth, conversationId in
            AskWebSocketClient(auth: auth, conversationId: conversationId)
        }
        if let socket {
            self.socket = socket
            self.conversationId = socket.conversationId
        } else {
            self.conversationId = UUID().uuidString
        }
        self.stopTimeoutNanoseconds = stopTimeoutNanoseconds
        self.briefingTurnTimeoutNanoseconds = briefingTurnTimeoutNanoseconds
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
                await newChat(auth: auth, organizationId: organizationId, snapshots: snapshots)
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
            await tearDownSocket(cancelActive: false)
            messages = []
            conversationId = UUID().uuidString
            modelPreset = "fast"
            activeTool = nil
            completedTool = nil
            sessionUsage = nil
            sessionLimitWarning = nil
            urgentWarningAcknowledged = false
            state = .idle
            turnPhase = .idle
            lastSyncedLabel = nil
            lastActivityAt = Date()
        }

        self.organizationId = organizationId
        self.snapshots = snapshots

        // Live or backgrounded-in-memory session: refresh status only.
        if !orgChanged, socket != nil || !messages.isEmpty {
            do {
                status = try await api.copilotStatus()
                await expireIdleConversationIfNeeded(auth: auth, organizationId: organizationId, snapshots: snapshots)
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
            sessionUsage = cached.payload.sessionUsage
            conversationId = cached.payload.conversationId
            if let activityMs = cached.payload.lastActivityAtMs {
                lastActivityAt = Date(timeIntervalSince1970: activityMs / 1000)
            } else if let syncedAt = snapshots.syncedAt(domain: SnapshotDomain.ask, organizationId: organizationId) {
                lastActivityAt = syncedAt
            }
            // Socket is created lazily on send so background/resume never reuses a
            // poisoned AsyncStream from a prior WebSocket client.
            socket = nil
            isConnected = false
            lastSyncedLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.ask, organizationId: organizationId)
        } else {
            conversationId = UUID().uuidString
            socket = nil
            isConnected = false
            lastActivityAt = Date()
        }

        do {
            status = try await api.copilotStatus()
            await expireIdleConversationIfNeeded(auth: auth, organizationId: organizationId, snapshots: snapshots)
        } catch {
            isConnected = false
            state = .error((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    /// Returns true when an idle session was expired and replaced with a fresh chat.
    @discardableResult
    func expireIdleConversationIfNeeded(
        auth: AuthManager,
        organizationId: String,
        snapshots: SnapshotStore
    ) async -> Bool {
        guard let status else { return false }
        guard !messages.isEmpty else { return false }
        guard !CopilotSessionResumePolicy.canResume(
            lastActivityAt: lastActivityAt,
            now: Date(),
            sessionIdleMs: status.sessionIdleMs
        ) else {
            return false
        }
        await newChat(auth: auth, organizationId: organizationId, snapshots: snapshots)
        return true
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
              !isAwaitingApproval,
              !briefingComplete else { return false }
        _ = await expireIdleConversationIfNeeded(
            auth: auth,
            organizationId: organizationId,
            snapshots: snapshots
        )
        if CopilotSessionResumePolicy.shouldForceIdleAfterResume(
            socketConnected: isConnected,
            isTurnActive: isTurnActive || isStopping
        ) {
            completeTurn(state: .idle)
        }
        guard !isTurnActive else { return false }
        isSubmitting = true
        defer { isSubmitting = false }
        self.organizationId = organizationId
        self.snapshots = snapshots

        if let status,
           !tracksBriefingSession,
           status.tier == "crew_member",
           status.freeConversationsRemaining <= 0,
           !status.autoDeductConsent {
            state = .allowanceExhausted("Your Crew allowance is used. Confirm once to let Copilot use the shared credit balance for future chats.")
            turnPhase = .idle
            return false
        }
        let socket = ensureSocket(auth: auth)

        do {
            turnPhase = .connecting
            beginTurn()
            state = .streaming
            if !isConnected {
                observe(socket)
                try await socket.connect()
                isConnected = true
                clearTransientError()
            }
            // Re-check after connect: a buffered close error from a reused client
            // must not leave us "thinking" with isTurnActive == false.
            guard isTurnActive else { return false }
            clearTransientError()
            let userMessage = CopilotMessage(role: "user", content: trimmed)
            messages.append(userMessage)
            lastActivityAt = Date()
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
                lastActivityAt = Date()
                expectingApprovalContinuation = true
                seenPostApprovalActivity = false
                isTurnActive = true
                state = .streaming
                turnPhase = .thinking
            } else {
                expectingApprovalContinuation = false
                seenPostApprovalActivity = false
                pauseApprovalRequestId = nil
                completeTurn(state: .idle)
                scheduleImmediateSnapshotSave()
            }
        } catch {
            expectingApprovalContinuation = false
            seenPostApprovalActivity = false
            pauseApprovalRequestId = nil
            completeTurn(state: .error(error.localizedDescription))
        }
    }

    func stop() async {
        guard (isTurnActive || isAwaitingApproval), !isStopping else { return }
        isStopping = true
        isAwaitingApproval = false
        if case .awaitingApproval = state {
            state = .streaming
        }

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
            self.dropLiveSocket()
            self.completeTurn(state: .idle)
            self.scheduleImmediateSnapshotSave()
        }
    }

    func newChat(auth: AuthManager, organizationId: String, snapshots: SnapshotStore) async {
        snapshotSaveTask?.cancel()
        stopTimeoutTask?.cancel()
        stopTimeoutTask = nil
        cancelBriefingTurnTimeout()
        toolLingerTask?.cancel()
        toolLingerTask = nil

        await tearDownSocket(cancelActive: isTurnActive || isStopping || isAwaitingApproval)

        conversationId = UUID().uuidString
        socket = makeSocket(auth, conversationId)
        isConnected = false
        messages = []
        modelPreset = "fast"
        activeTool = nil
        completedTool = nil
        sessionUsage = nil
        sessionLimitWarning = nil
        urgentWarningAcknowledged = false
        lastActivityAt = Date()
        completeTurn(state: .idle)
        await snapshots.clear(domain: SnapshotDomain.ask, organizationId: organizationId)
        lastSyncedLabel = nil
    }

    func setModelPreset(_ preset: String) {
        guard preset == "fast" || preset == "deep" else { return }
        modelPreset = preset
    }

    func disconnect() {
        snapshotSaveTask?.cancel()
        snapshotSaveTask = nil
        toolLingerTask?.cancel()
        toolLingerTask = nil
        dropLiveSocket()
        completeTurn(state: .idle)
    }

    /// Close/X backgrounds the chat: cancel in-flight work, drop the socket client
    /// (fresh AsyncStream on resume), keep transcript + conversationId.
    func backgroundSession() async {
        stopTimeoutTask?.cancel()
        stopTimeoutTask = nil
        cancelBriefingTurnTimeout()
        toolLingerTask?.cancel()
        toolLingerTask = nil
        await tearDownSocket(cancelActive: isTurnActive || isStopping || isAwaitingApproval)
        isSubmitting = false
        activeTool = nil
        completedTool = nil
        completeTurn(state: .idle)
        clearTransientError()
    }

    func persistSnapshotNow(touchActivity: Bool = true) async {
        guard let organizationId, let snapshots else { return }
        if touchActivity {
            lastActivityAt = Date()
        }
        let conversationId = self.conversationId
        await snapshots.save(
            Snapshot(
                conversationId: conversationId,
                messages: messages,
                modelPreset: modelPreset,
                sessionUsage: sessionUsage,
                lastActivityAtMs: lastActivityAt.timeIntervalSince1970 * 1000
            ),
            domain: SnapshotDomain.ask,
            organizationId: organizationId
        )
        lastSyncedLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.ask, organizationId: organizationId)
    }

    func clearTransientError() {
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
        scheduleBriefingTurnTimeoutIfNeeded()
        scheduleTurnWatchdog()
    }

    func beginTurnIfNeeded() {
        if !isTurnActive {
            beginTurn()
        }
    }

    private func scheduleBriefingTurnTimeoutIfNeeded() {
        cancelBriefingTurnTimeout()
        guard tracksBriefingSession else { return }
        briefingTurnTimeoutTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(nanoseconds: self.briefingTurnTimeoutNanoseconds)
            guard !Task.isCancelled else { return }
            guard self.tracksBriefingSession, self.isTurnActive else { return }
            do {
                try await self.socket?.cancelActiveRequest()
            } catch {
                // Best-effort cancel; still force-complete the turn below.
            }
            self.dropLiveSocket()
            // Tools may have already written Cargo — treat as success so the user
            // is not shown a failure after a successful seed.
            if self.seedTurnStarted, self.seedItemsAdded > 0 {
                self.seedComplete = true
                self.briefingComplete = true
                self.completeTurn(state: .idle)
            } else {
                self.completeTurn(state: .error(Self.briefingTurnTimeoutMessage))
            }
        }
    }

    func cancelBriefingTurnTimeout() {
        briefingTurnTimeoutTask?.cancel()
        briefingTurnTimeoutTask = nil
    }

    func markPostApprovalActivity() {
        guard expectingApprovalContinuation else { return }
        seenPostApprovalActivity = true
        lastActivityAt = Date()
    }

    private func scheduleTurnWatchdog() {
        turnWatchdogTask?.cancel()
        turnWatchdogTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                guard !Task.isCancelled else { return }
                guard self.isTurnActive || self.expectingApprovalContinuation,
                      !self.isAwaitingApproval else { continue }
                let idleNs =
                    UInt64(Date().timeIntervalSince(self.lastActivityAt) * 1_000_000_000)
                if idleNs >= self.turnWatchdogNanoseconds {
                    do {
                        try await self.socket?.cancelActiveRequest()
                    } catch {
                        // Best-effort
                    }
                    self.completeTurn(state: .error(Self.turnWatchdogMessage))
                    return
                }
            }
        }
    }

    func completeTurn(state: State) {
        stopTimeoutTask?.cancel()
        stopTimeoutTask = nil
        cancelBriefingTurnTimeout()
        turnWatchdogTask?.cancel()
        turnWatchdogTask = nil
        toolLingerTask?.cancel()
        toolLingerTask = nil
        activeTool = nil
        completedTool = nil
        isTurnActive = false
        isStopping = false
        isAwaitingApproval = false
        expectingApprovalContinuation = false
        seenPostApprovalActivity = false
        pauseApprovalRequestId = nil
        turnPhase = .idle
        self.state = state
    }
}
