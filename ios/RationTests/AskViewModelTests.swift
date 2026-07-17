import Foundation
import XCTest
@testable import Ration

@MainActor
final class AskViewModelTests: XCTestCase {
    func testTextDeltaCreatesAssistantMessage() {
        let model = AskViewModel()

        model.apply(
            CopilotStreamEvent(
                type: "text_delta",
                message: nil,
                messageId: "assistant-1",
                text: "Hello",
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
        )

        XCTAssertEqual(model.messages.count, 1)
        XCTAssertEqual(model.messages.first?.role, "assistant")
        XCTAssertEqual(model.messages.first?.content, "Hello")
    }

    func testApprovalRequestMovesToAwaitingApproval() {
        let model = AskViewModel()

        model.apply(
            CopilotStreamEvent(
                type: "approval_request",
                message: nil,
                messageId: nil,
                text: nil,
                usageTokens: nil,
                status: nil,
                toolCallId: nil,
                ok: nil,
                error: nil,
                approvalId: "approval-1",
                toolName: "remove_cargo_item",
                title: "Remove item?",
                description: "Remove milk from Cargo.",
                blocked: nil
            )
        )

        XCTAssertEqual(model.state, .awaitingApproval(id: "approval-1", title: "Remove item?", description: "Remove milk from Cargo."))
    }

    func testBlockedFeatureMovesToBlocked() {
        let model = AskViewModel()
        let blocked = CopilotBlockedFeature(
            feature: "scan",
            message: "Use Scan.",
            deepLink: "ration://scan"
        )

        model.apply(
            CopilotStreamEvent(
                type: "blocked_feature",
                message: nil,
                messageId: nil,
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
                blocked: blocked
            )
        )

        XCTAssertEqual(model.state, .blocked(blocked))
    }

    func testBriefingSessionTracksIntroThenSeed() {
        let model = AskViewModel()
        model.beginOnboardingBriefingSession()
        XCTAssertEqual(model.modelPreset, "fast")
        XCTAssertTrue(model.tracksBriefingSession)
        XCTAssertTrue(model.liveBriefingActive)

        model.apply(
            CopilotStreamEvent(
                type: "text_delta",
                message: nil,
                messageId: "asst-1",
                text: "Ration connects Cargo to Galley.",
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
        )
        model.apply(
            CopilotStreamEvent(
                type: "message_end",
                message: nil,
                messageId: "asst-1",
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
        )
        XCTAssertTrue(model.introComplete)
        XCTAssertTrue(model.introSucceeded)
        XCTAssertFalse(model.seedComplete)
        XCTAssertFalse(model.briefingComplete)

        model.markSeedTurnStarted()
        model.apply(
            CopilotStreamEvent(
                type: "tool_start",
                message: nil,
                messageId: nil,
                text: nil,
                usageTokens: nil,
                status: CopilotToolStatus(toolCallId: "t1", toolName: "add_cargo_item", label: "Adding…"),
                toolCallId: "t1",
                ok: nil,
                error: nil,
                approvalId: nil,
                toolName: "add_cargo_item",
                title: nil,
                description: nil,
                blocked: nil
            )
        )
        model.apply(
            CopilotStreamEvent(
                type: "tool_end",
                message: nil,
                messageId: nil,
                text: nil,
                usageTokens: nil,
                status: nil,
                toolCallId: "t1",
                ok: true,
                error: nil,
                approvalId: nil,
                toolName: "add_cargo_item",
                title: nil,
                description: nil,
                blocked: nil
            )
        )
        XCTAssertEqual(model.seedItemsAdded, 1)

        model.apply(
            CopilotStreamEvent(
                type: "message_end",
                message: nil,
                messageId: "asst-2",
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
        )
        XCTAssertTrue(model.seedComplete)
        XCTAssertTrue(model.briefingComplete)
        XCTAssertEqual(model.seedSuccessMessage, "1 item added to Cargo")

        model.resetBriefingSession()
        XCTAssertEqual(model.modelPreset, "fast")
        XCTAssertFalse(model.introComplete)
        XCTAssertFalse(model.liveBriefingActive)
        XCTAssertEqual(model.seedItemsAdded, 0)
    }

    func testStaticBriefingDoesNotActivateLiveSeedPath() {
        let model = AskViewModel()
        model.showStaticBriefing("Static welcome")
        XCTAssertTrue(model.introComplete)
        XCTAssertTrue(model.introSucceeded)
        XCTAssertTrue(model.briefingComplete)
        XCTAssertFalse(model.liveBriefingActive)
        XCTAssertFalse(model.seedComplete)
    }

    func testIdleMessageEndDoesNotFakeSeedComplete() {
        let model = AskViewModel()
        model.beginOnboardingBriefingSession()
        model.apply(
            CopilotStreamEvent(
                type: "message_end",
                message: nil,
                messageId: "asst-1",
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
        )
        XCTAssertTrue(model.introComplete)
        XCTAssertFalse(model.introSucceeded)
        if case let .error(message) = model.state {
            XCTAssertEqual(message, OnboardingBriefingCopy.emptyIntroMessage)
        } else {
            XCTFail("Expected empty-intro error, got \(model.state)")
        }
        // Late/idle message_end after intro must not mark seed complete or clear the error.
        model.apply(
            CopilotStreamEvent(
                type: "message_end",
                message: nil,
                messageId: "asst-ghost",
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
        )
        XCTAssertFalse(model.seedComplete)
        XCTAssertFalse(model.briefingComplete)
        XCTAssertFalse(model.introSucceeded)
        if case let .error(message) = model.state {
            XCTAssertEqual(message, OnboardingBriefingCopy.emptyIntroMessage)
        } else {
            XCTFail("Expected empty-intro error to persist, got \(model.state)")
        }
    }

    func testLateMessageEndAfterTimeoutKeepsErrorUnlessContentArrives() {
        let model = AskViewModel()
        model.beginOnboardingBriefingSession()
        model.apply(
            CopilotStreamEvent(
                type: "message_start",
                message: CopilotMessage(id: "a1", role: "assistant", content: ""),
                messageId: "a1",
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
        )
        model.forceEndBriefingTurn()
        model.surfaceBriefingError(AskViewModel.briefingTurnTimeoutMessage)
        XCTAssertFalse(model.isTurnActive)

        model.apply(
            CopilotStreamEvent(
                type: "message_end",
                message: nil,
                messageId: "a1",
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
        )
        if case let .error(message) = model.state {
            XCTAssertEqual(message, AskViewModel.briefingTurnTimeoutMessage)
        } else {
            XCTFail("Expected timeout error to persist, got \(model.state)")
        }
        XCTAssertFalse(model.introSucceeded)
    }

    func testBriefingTurnTimeoutSurfacesError() async {
        let socket = StreamingTestAskSocketClient()
        let model = AskViewModel(
            socket: socket,
            stopTimeoutNanoseconds: 50_000_000,
            briefingTurnTimeoutNanoseconds: 80_000_000
        )
        model.beginOnboardingBriefingSession()
        // Simulate an active turn the way send() does.
        model.apply(
            CopilotStreamEvent(
                type: "message_start",
                message: CopilotMessage(id: "a1", role: "assistant", content: ""),
                messageId: "a1",
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
        )
        XCTAssertTrue(model.isTurnActive)

        try? await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertFalse(model.isTurnActive)
        if case let .error(message) = model.state {
            XCTAssertEqual(message, AskViewModel.briefingTurnTimeoutMessage)
        } else {
            XCTFail("Expected timeout error state, got \(model.state)")
        }
    }

    func testOnboardingInvalidPromptSurfacesError() {
        let model = AskViewModel()
        model.beginOnboardingBriefingSession()
        model.apply(
            CopilotStreamEvent(
                type: "message_start",
                message: CopilotMessage(id: "a1", role: "assistant", content: ""),
                messageId: "a1",
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
        )
        model.apply(
            CopilotStreamEvent(
                type: "error",
                message: nil,
                messageId: nil,
                text: nil,
                usageTokens: nil,
                status: nil,
                toolCallId: nil,
                ok: nil,
                error: CopilotToolError(
                    code: "onboarding_briefing_invalid_prompt",
                    message: "That prompt isn't part of the welcome briefing."
                ),
                approvalId: nil,
                toolName: nil,
                title: nil,
                description: nil,
                blocked: nil
            )
        )
        XCTAssertFalse(model.isTurnActive)
        if case let .error(message) = model.state {
            XCTAssertTrue(message.contains("welcome briefing"))
        } else {
            XCTFail("Expected error state, got \(model.state)")
        }
    }

    func testToolEndLingersThenClears() async {
        let model = AskViewModel()

        model.apply(
            CopilotStreamEvent(
                type: "tool_start",
                message: nil,
                messageId: nil,
                text: nil,
                usageTokens: nil,
                status: CopilotToolStatus(toolCallId: "t1", toolName: "list_inventory", label: "Checking"),
                toolCallId: nil,
                ok: nil,
                error: nil,
                approvalId: nil,
                toolName: nil,
                title: nil,
                description: nil,
                blocked: nil
            )
        )

        XCTAssertEqual(model.turnPhase, .toolRunning)
        XCTAssertNotNil(model.activeTool)

        model.apply(
            CopilotStreamEvent(
                type: "tool_end",
                message: nil,
                messageId: nil,
                text: nil,
                usageTokens: nil,
                status: nil,
                toolCallId: "t1",
                ok: true,
                error: nil,
                approvalId: nil,
                toolName: nil,
                title: nil,
                description: nil,
                blocked: nil
            )
        )

        XCTAssertNil(model.activeTool)
        XCTAssertNotNil(model.completedTool)
        XCTAssertEqual(model.turnPhase, .toolDone)
        XCTAssertNotNil(model.completedTool)

        try? await Task.sleep(nanoseconds: 900_000_000)
        XCTAssertNil(model.completedTool)
        XCTAssertEqual(model.turnPhase, .thinking)
    }

    func testToolEndWithoutExplicitSuccessIsNotReportedAsSuccessful() {
        let model = AskViewModel()
        model.apply(
            Self.event(
                type: "tool_start",
                status: CopilotToolStatus(
                    toolCallId: "tool-1",
                    toolName: "list_inventory",
                    label: "Checking"
                )
            )
        )

        model.apply(Self.event(type: "tool_end", toolCallId: "tool-1"))

        XCTAssertEqual(model.completedTool?.succeeded, false)
    }

    func testMessageStartDoesNotDuplicateAssistantFromTextDelta() {
        let model = AskViewModel()

        model.apply(
            CopilotStreamEvent(
                type: "text_delta",
                message: nil,
                messageId: "assistant-1",
                text: "Hello",
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
        )

        model.apply(
            CopilotStreamEvent(
                type: "message_start",
                message: CopilotMessage(id: "assistant-1", role: "assistant", content: ""),
                messageId: "assistant-1",
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
        )

        XCTAssertEqual(model.messages.count, 1)
        XCTAssertEqual(model.messages.first?.content, "Hello")
    }

    func testSecondTurnDeltaCreatesAssistantAfterLatestUserMessage() {
        let model = AskViewModel()

        model.apply(Self.event(type: "message_start", message: CopilotMessage(role: "user", content: "First")))
        model.apply(Self.event(type: "text_delta", messageId: "assistant-1", text: "First reply"))
        model.apply(Self.event(type: "message_start", message: CopilotMessage(role: "user", content: "Second")))
        model.apply(Self.event(type: "text_delta", messageId: "assistant-2", text: "Second reply"))

        XCTAssertEqual(model.messages.map(\.role), ["user", "assistant", "user", "assistant"])
        XCTAssertEqual(model.messages.map(\.content), ["First", "First reply", "Second", "Second reply"])
        XCTAssertEqual(model.messages.last?.id, "assistant-2")
        XCTAssertEqual(model.streamingContentLength, "Second reply".count)
    }

    func testActiveTurnCompletesOnMessageEnd() {
        let model = AskViewModel()

        model.apply(Self.event(type: "text_delta", messageId: "assistant-1", text: "Partial"))

        XCTAssertTrue(model.isTurnActive)
        XCTAssertEqual(model.turnPhase, .streaming)

        model.apply(Self.event(type: "message_end"))

        XCTAssertFalse(model.isTurnActive)
        XCTAssertFalse(model.isStopping)
        XCTAssertFalse(model.isAwaitingApproval)
        XCTAssertEqual(model.state, .idle)
        XCTAssertEqual(model.turnPhase, .idle)
        XCTAssertEqual(model.messages.last?.content, "Partial")
    }

    func testApprovalRequestLocksTurnAndDenialCompletes() async {
        let socket = TestAskSocketClient()
        let model = AskViewModel(socket: socket)

        model.apply(
            Self.event(
                type: "approval_request",
                approvalId: "approval-1",
                title: "Remove item?",
                description: "Remove milk."
            )
        )

        XCTAssertTrue(model.isTurnActive)
        XCTAssertTrue(model.isAwaitingApproval)

        await model.approve("approval-1", approved: false)

        XCTAssertEqual(socket.approvalResponses.count, 1)
        XCTAssertEqual(socket.approvalResponses.first?.id, "approval-1")
        XCTAssertEqual(socket.approvalResponses.first?.approved, false)
        XCTAssertFalse(model.isTurnActive)
        XCTAssertFalse(model.isAwaitingApproval)
        XCTAssertEqual(model.state, .idle)
    }

    func testApprovalResumesActiveTurn() async {
        let socket = TestAskSocketClient()
        let model = AskViewModel(socket: socket)
        model.apply(Self.event(type: "approval_request", approvalId: "approval-1"))

        await model.approve("approval-1", approved: true)

        XCTAssertEqual(socket.approvalResponses.first?.approved, true)
        XCTAssertTrue(model.isTurnActive)
        XCTAssertFalse(model.isAwaitingApproval)
        XCTAssertEqual(model.state, .streaming)
        XCTAssertEqual(model.turnPhase, .thinking)
    }

    func testDisconnectRecoversActiveTurnToReady() {
        let socket = TestAskSocketClient()
        let model = AskViewModel(socket: socket)
        model.apply(Self.event(type: "text_delta", text: "Partial"))

        model.disconnect()

        XCTAssertTrue(socket.didDisconnect)
        XCTAssertFalse(model.isTurnActive)
        XCTAssertFalse(model.isStopping)
        XCTAssertEqual(model.state, .idle)
    }

    func testStopWaitsForTerminalEventAndKeepsPartialOutput() async {
        let socket = TestAskSocketClient()
        let model = AskViewModel(socket: socket)
        model.apply(Self.event(type: "text_delta", text: "Keep this"))

        await model.stop()

        XCTAssertEqual(socket.cancelCount, 1)
        XCTAssertTrue(model.isTurnActive)
        XCTAssertTrue(model.isStopping)

        model.apply(Self.event(type: "message_end"))

        XCTAssertFalse(model.isTurnActive)
        XCTAssertFalse(model.isStopping)
        XCTAssertEqual(model.state, .idle)
        XCTAssertEqual(model.messages.last?.content, "Keep this")
    }

    func testStopTimeoutDisconnectsBeforeCompletingTurn() async {
        let socket = TestAskSocketClient()
        let model = AskViewModel(socket: socket, stopTimeoutNanoseconds: 1_000_000)
        model.apply(Self.event(type: "text_delta", text: "Partial"))

        await model.stop()
        try? await Task.sleep(nanoseconds: 10_000_000)

        XCTAssertTrue(socket.didDisconnect)
        XCTAssertFalse(model.isTurnActive)
        XCTAssertFalse(model.isStopping)
        XCTAssertEqual(model.state, .idle)
        XCTAssertEqual(model.messages.last?.content, "Partial")
    }

    func testObservedEventsAreIgnoredWhileIdleExceptTerminalEvent() {
        let model = AskViewModel()

        XCTAssertFalse(model.shouldAcceptObservedEvent(Self.event(type: "text_delta", text: "Late")))
        XCTAssertTrue(model.shouldAcceptObservedEvent(Self.event(type: "message_end")))
        XCTAssertTrue(
            model.shouldAcceptObservedEvent(
                Self.event(
                    type: "error",
                    error: CopilotToolError(code: "socket_closed", message: "Closed")
                )
            )
        )

        model.apply(Self.event(type: "text_delta", text: "Active"))

        XCTAssertTrue(model.shouldAcceptObservedEvent(Self.event(type: "text_delta", text: "More")))
    }

    func testIdleSocketErrorDoesNotShowTurnError() {
        let model = AskViewModel()

        model.apply(
            Self.event(
                type: "error",
                error: CopilotToolError(code: "socket_closed", message: "Closed")
            )
        )

        XCTAssertEqual(model.state, .idle)
        XCTAssertFalse(model.isTurnActive)
    }

    func testSessionLimitPreservesTranscriptAndShowsContinuationState() {
        let socket = TestAskSocketClient()
        let model = AskViewModel(socket: socket)
        model.apply(Self.event(type: "text_delta", text: "Existing"))

        model.apply(
            Self.event(
                type: "error",
                error: CopilotToolError(
                    code: "session_limit_reached",
                    message: "Start a new conversation."
                )
            )
        )

        XCTAssertEqual(model.messages.count, 1)
        XCTAssertEqual(model.messages.first?.content, "Existing")
        XCTAssertFalse(model.isTurnActive)
        XCTAssertEqual(
            model.state,
            .sessionLimitReached("Start a new conversation.")
        )
    }

    func testApprovalIgnoredWhileStopping() async {
        let socket = TestAskSocketClient()
        let model = AskViewModel(socket: socket)
        model.apply(Self.event(type: "text_delta", text: "Partial"))

        await model.stop()

        model.apply(
            Self.event(
                type: "approval_request",
                approvalId: "approval-1",
                title: "Remove item?"
            )
        )

        XCTAssertFalse(model.isAwaitingApproval)
        XCTAssertTrue(model.isStopping)
        if case .awaitingApproval = model.state {
            XCTFail("Approval UI should not appear while stopping")
        }
    }

    func testNewChatClearsActiveTurnAndMessages() async {
        let socket = TestAskSocketClient()
        let model = AskViewModel(socket: socket)
        model.apply(Self.event(type: "text_delta", text: "Partial"))

        await model.newChat(auth: AuthManager(), organizationId: "org-1", snapshots: SnapshotStore())

        XCTAssertTrue(socket.didDisconnect)
        XCTAssertFalse(model.isTurnActive)
        XCTAssertFalse(model.isStopping)
        XCTAssertEqual(model.messages.count, 0)
        XCTAssertEqual(model.state, .idle)
    }

    func testSendActivatesTurnAndShowsThinkingActivity() async {
        let socket = StreamingTestAskSocketClient()
        let model = AskViewModel(socket: socket)
        let auth = AuthManager()
        let api = RationAPI(client: APIClient(auth: auth))
        let snapshots = SnapshotStore()

        let accepted = await model.send(
            "Hello",
            api: api,
            auth: auth,
            organizationId: "org-1",
            snapshots: snapshots
        )

        XCTAssertTrue(accepted)
        XCTAssertEqual(model.messages.count, 1)
        XCTAssertEqual(model.messages.first?.role, "user")
        XCTAssertEqual(model.messages.first?.content, "Hello")
        XCTAssertTrue(model.isTurnActive)
        XCTAssertEqual(model.turnPhase, .thinking)
        XCTAssertEqual(model.activityDisplay, .thinking)
        XCTAssertEqual(socket.connectCount, 1)
        XCTAssertEqual(socket.sentMessages.count, 1)
    }

    func testSendObservesStreamingEventsUntilMessageEnd() async {
        let socket = StreamingTestAskSocketClient()
        let model = AskViewModel(socket: socket)
        let auth = AuthManager()
        let api = RationAPI(client: APIClient(auth: auth))
        let snapshots = SnapshotStore()

        let accepted = await model.send(
            "Hello",
            api: api,
            auth: auth,
            organizationId: "org-1",
            snapshots: snapshots
        )
        XCTAssertTrue(accepted)

        socket.emit(Self.event(type: "text_delta", text: "Hi there"))
        try? await Task.sleep(nanoseconds: 20_000_000)
        socket.emit(Self.event(type: "message_end"))
        try? await Task.sleep(nanoseconds: 20_000_000)

        XCTAssertEqual(model.messages.map(\.role), ["user", "assistant"])
        XCTAssertEqual(model.messages.last?.content, "Hi there")
        XCTAssertFalse(model.isTurnActive)
        XCTAssertEqual(model.state, .idle)
    }

    private static func event(
        type: String,
        message: CopilotMessage? = nil,
        messageId: String? = nil,
        text: String? = nil,
        status: CopilotToolStatus? = nil,
        toolCallId: String? = nil,
        ok: Bool? = nil,
        error: CopilotToolError? = nil,
        approvalId: String? = nil,
        title: String? = nil,
        description: String? = nil
    ) -> CopilotStreamEvent {
        CopilotStreamEvent(
            type: type,
            message: message,
            messageId: messageId,
            text: text,
            usageTokens: nil,
            status: status,
            toolCallId: toolCallId,
            ok: ok,
            error: error,
            approvalId: approvalId,
            toolName: nil,
            title: title,
            description: description,
            blocked: nil
        )
    }
}

@MainActor
private final class StreamingTestAskSocketClient: AskSocketClient {
    var conversationId = "test-conversation"
    var connectCount = 0
    var sentMessages: [[CopilotMessage]] = []
    private let eventStream: AsyncStream<CopilotStreamEvent>
    private let eventContinuation: AsyncStream<CopilotStreamEvent>.Continuation

    init() {
        var continuation: AsyncStream<CopilotStreamEvent>.Continuation!
        eventStream = AsyncStream { cont in
            continuation = cont
        }
        eventContinuation = continuation
    }

    func events() -> AsyncStream<CopilotStreamEvent> {
        eventStream
    }

    func connect() async throws {
        connectCount += 1
    }

    func send(_ messages: [CopilotMessage], modelPreset: String) async throws {
        sentMessages.append(messages)
    }

    func approve(_ approvalId: String, approved: Bool) async throws {}

    func cancelActiveRequest() async throws {}

    func newConversation() {
        conversationId = "new-test-conversation"
    }

    func disconnect() {}

    func emit(_ event: CopilotStreamEvent) {
        eventContinuation.yield(event)
    }
}

@MainActor
private final class TestAskSocketClient: AskSocketClient {
    var conversationId = "test-conversation"
    var approvalResponses: [(id: String, approved: Bool)] = []
    var cancelCount = 0
    var didDisconnect = false

    func events() -> AsyncStream<CopilotStreamEvent> {
        AsyncStream { _ in }
    }

    func connect() async throws {}
    func send(_ messages: [CopilotMessage], modelPreset: String) async throws {}

    func approve(_ approvalId: String, approved: Bool) async throws {
        approvalResponses.append((approvalId, approved))
    }

    func cancelActiveRequest() async throws {
        cancelCount += 1
    }

    func newConversation() {
        conversationId = "new-test-conversation"
        disconnect()
    }

    func disconnect() {
        didDisconnect = true
    }
}
