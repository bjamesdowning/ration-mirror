import XCTest
@testable import Ration

final class CopilotAutoExpandPolicyTests: XCTestCase {
    func testCanAutoExpandWithFreeConversations() {
        let status = CopilotStatusResponse(
            tier: "crew_member",
            freeConversationsRemaining: 2,
            allowanceResetAt: Date(),
            creditBalance: 0,
            autoDeductConsent: false,
            conversationFloorCost: 1,
            sessionIdleMs: 1_200_000,
            brackets: []
        )

        XCTAssertTrue(CopilotAutoExpandPolicy.canAutoExpand(status: status))
    }

    func testCannotAutoExpandWithoutCreditsOrConsent() {
        let status = CopilotStatusResponse(
            tier: "crew_member",
            freeConversationsRemaining: 0,
            allowanceResetAt: Date(),
            creditBalance: 0,
            autoDeductConsent: false,
            conversationFloorCost: 1,
            sessionIdleMs: 1_200_000,
            brackets: []
        )

        XCTAssertFalse(CopilotAutoExpandPolicy.canAutoExpand(status: status))
    }
}
