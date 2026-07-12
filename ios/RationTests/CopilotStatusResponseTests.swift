import XCTest
@testable import Ration

final class CopilotStatusResponseTests: XCTestCase {
    func testDecodesOnboardingBriefingFieldsFromJSON() throws {
        let json = """
        {
          "tier": "free",
          "freeConversationsRemaining": 1,
          "allowanceResetAt": "2026-07-12T12:00:00.000Z",
          "creditBalance": 0,
          "autoDeductConsent": false,
          "conversationFloorCost": 1,
          "sessionIdleMs": 1200000,
          "brackets": [],
          "onboardingBriefingEligible": true,
          "onboardingBriefingConsumed": false
        }
        """.data(using: .utf8)!

        let status = try JSON.decoder.decode(CopilotStatusResponse.self, from: json)

        XCTAssertEqual(status.onboardingBriefingEligible, true)
        XCTAssertEqual(status.onboardingBriefingConsumed, false)
        XCTAssertTrue(status.canUseOnboardingBriefing)
    }

    func testDecodesWhenOnboardingBriefingFieldsOmitted() throws {
        let json = """
        {
          "tier": "crew_member",
          "freeConversationsRemaining": 2,
          "allowanceResetAt": "2026-07-12T12:00:00.000Z",
          "creditBalance": 5,
          "autoDeductConsent": true,
          "conversationFloorCost": 1,
          "sessionIdleMs": 1200000,
          "brackets": []
        }
        """.data(using: .utf8)!

        let status = try JSON.decoder.decode(CopilotStatusResponse.self, from: json)

        XCTAssertNil(status.onboardingBriefingEligible)
        XCTAssertNil(status.onboardingBriefingConsumed)
        XCTAssertFalse(status.canUseOnboardingBriefing)
    }
}
