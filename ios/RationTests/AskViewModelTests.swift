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
        XCTAssertEqual(model.turnPhase, .thinking)
        XCTAssertNotNil(model.completedTool)

        try? await Task.sleep(nanoseconds: 900_000_000)
        XCTAssertNil(model.completedTool)
        XCTAssertEqual(model.turnPhase, .thinking)
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

    func testStopTimeoutDisconnectsAndCompletesTurn() async {
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

    func testNewChatClearsActiveTurnAndMessages() {
        let socket = TestAskSocketClient()
        let model = AskViewModel(socket: socket)
        model.apply(Self.event(type: "text_delta", text: "Partial"))

        model.newChat(auth: AuthManager(), organizationId: "org-1", snapshots: SnapshotStore())

        XCTAssertTrue(socket.didDisconnect)
        XCTAssertFalse(model.isTurnActive)
        XCTAssertFalse(model.isStopping)
        XCTAssertEqual(model.messages.count, 0)
        XCTAssertEqual(model.state, .idle)
    }

    private static func event(
        type: String,
        messageId: String? = nil,
        text: String? = nil,
        approvalId: String? = nil,
        title: String? = nil,
        description: String? = nil
    ) -> CopilotStreamEvent {
        CopilotStreamEvent(
            type: type,
            message: nil,
            messageId: messageId,
            text: text,
            usageTokens: nil,
            status: nil,
            toolCallId: nil,
            ok: nil,
            error: nil,
            approvalId: approvalId,
            toolName: nil,
            title: title,
            description: description,
            blocked: nil
        )
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
    func send(_ messages: [CopilotMessage]) async throws {}

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
