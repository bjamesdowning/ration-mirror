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
            tokensPerCredit: 20_000,
            sessionMaxTokens: 128_000,
            onboardingBriefingEligible: nil,
            onboardingBriefingConsumed: nil
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
            tokensPerCredit: 20_000,
            sessionMaxTokens: 128_000,
            onboardingBriefingEligible: nil,
            onboardingBriefingConsumed: nil
        )

        XCTAssertFalse(CopilotAutoExpandPolicy.canAutoExpand(status: status))
    }

    func testIsCopilotExhaustedForFreeTierWithoutCredits() {
        let status = CopilotStatusResponse(
            tier: "free",
            freeConversationsRemaining: 0,
            allowanceResetAt: Date(),
            creditBalance: 0,
            autoDeductConsent: false,
            conversationFloorCost: 1,
            sessionIdleMs: 1_200_000,
            tokensPerCredit: 20_000,
            sessionMaxTokens: 128_000,
            onboardingBriefingEligible: nil,
            onboardingBriefingConsumed: nil
        )

        XCTAssertTrue(CopilotAutoExpandPolicy.isCopilotExhausted(status: status))
    }

    func testIsNotCopilotExhaustedWithFreeConversations() {
        let status = CopilotStatusResponse(
            tier: "crew_member",
            freeConversationsRemaining: 1,
            allowanceResetAt: Date(),
            creditBalance: 0,
            autoDeductConsent: false,
            conversationFloorCost: 1,
            sessionIdleMs: 1_200_000,
            tokensPerCredit: 20_000,
            sessionMaxTokens: 128_000,
            onboardingBriefingEligible: nil,
            onboardingBriefingConsumed: nil
        )

        XCTAssertFalse(CopilotAutoExpandPolicy.isCopilotExhausted(status: status))
    }

    func testIsCopilotExhaustedWhenCrewNeedsConsentButHasNoCredits() {
        let status = CopilotStatusResponse(
            tier: "crew_member",
            freeConversationsRemaining: 0,
            allowanceResetAt: Date(),
            creditBalance: 0,
            autoDeductConsent: false,
            conversationFloorCost: 1,
            sessionIdleMs: 1_200_000,
            tokensPerCredit: 20_000,
            sessionMaxTokens: 128_000,
            onboardingBriefingEligible: nil,
            onboardingBriefingConsumed: nil
        )

        XCTAssertTrue(CopilotAutoExpandPolicy.isCopilotExhausted(status: status))
        XCTAssertFalse(CopilotAutoExpandPolicy.canAutoExpand(status: status))
    }

    func testIsNotCopilotExhaustedWhenCrewHasCreditsButNeedsConsent() {
        let status = CopilotStatusResponse(
            tier: "crew_member",
            freeConversationsRemaining: 0,
            allowanceResetAt: Date(),
            creditBalance: 5,
            autoDeductConsent: false,
            conversationFloorCost: 1,
            sessionIdleMs: 1_200_000,
            tokensPerCredit: 20_000,
            sessionMaxTokens: 128_000,
            onboardingBriefingEligible: nil,
            onboardingBriefingConsumed: nil
        )

        XCTAssertFalse(CopilotAutoExpandPolicy.isCopilotExhausted(status: status))
        XCTAssertFalse(CopilotAutoExpandPolicy.canAutoExpand(status: status))
    }

    func testIsCopilotExhaustedWhenCrewHasConsentButNoCredits() {
        let status = CopilotStatusResponse(
            tier: "crew_member",
            freeConversationsRemaining: 0,
            allowanceResetAt: Date(),
            creditBalance: 0,
            autoDeductConsent: true,
            conversationFloorCost: 1,
            sessionIdleMs: 1_200_000,
            tokensPerCredit: 20_000,
            sessionMaxTokens: 128_000,
            onboardingBriefingEligible: nil,
            onboardingBriefingConsumed: nil
        )

        XCTAssertTrue(CopilotAutoExpandPolicy.isCopilotExhausted(status: status))
    }

    func testIsNotCopilotExhaustedWhenStatusNil() {
        XCTAssertFalse(CopilotAutoExpandPolicy.isCopilotExhausted(status: nil))
    }
}
