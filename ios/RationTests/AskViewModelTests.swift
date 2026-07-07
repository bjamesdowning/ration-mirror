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
}
