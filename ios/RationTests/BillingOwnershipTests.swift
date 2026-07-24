import XCTest
@testable import Ration

final class BillingOwnershipTests: XCTestCase {
    func testPersonalCrewActiveFromEntitlement() {
        XCTAssertTrue(
            BillingOwnership.isPersonalCrewActive(
                entitlementsActive: true,
                accountTier: "free",
                fallbackTier: "free"
            )
        )
    }

    func testPersonalCrewActiveFromAccountTier() {
        XCTAssertTrue(
            BillingOwnership.isPersonalCrewActive(
                entitlementsActive: false,
                accountTier: "crew_member",
                fallbackTier: "free"
            )
        )
    }

    func testHouseholdOrganizationTierDoesNotGrantPersonalCrew() {
        XCTAssertFalse(
            BillingOwnership.isPersonalCrewActive(
                entitlementsActive: false,
                accountTier: "free",
                fallbackTier: "free"
            )
        )
    }

    func testShowCrewMarketingWhenPersonallyFree() {
        XCTAssertTrue(
            BillingOwnership.shouldShowCrewMarketing(
                isPersonalCrewActive: false,
                creditsTrigger: false
            )
        )
        XCTAssertFalse(
            BillingOwnership.shouldShowCrewMarketing(
                isPersonalCrewActive: true,
                creditsTrigger: false
            )
        )
        XCTAssertTrue(
            BillingOwnership.shouldShowCrewMarketing(
                isPersonalCrewActive: true,
                creditsTrigger: true
            )
        )
    }

    func testSubscriptionFulfillmentRequiresTransition() {
        XCTAssertTrue(
            BillingOwnership.subscriptionFulfillmentVisible(
                latestPersonalActive: true,
                baselinePersonalActive: false
            )
        )
        XCTAssertFalse(
            BillingOwnership.subscriptionFulfillmentVisible(
                latestPersonalActive: true,
                baselinePersonalActive: true
            )
        )
        XCTAssertFalse(
            BillingOwnership.subscriptionFulfillmentVisible(
                latestPersonalActive: false,
                baselinePersonalActive: false
            )
        )
    }

    func testMembershipDisplayForHouseholdMember() {
        XCTAssertEqual(
            MembershipDisplay.tierLabel(isAccountCrewMember: false),
            "Free"
        )
        XCTAssertEqual(
            MembershipDisplay.billingButtonTitle(isAccountCrewMember: false),
            "Upgrade to Crew Member"
        )
        XCTAssertEqual(
            MembershipDisplay.householdCapacityNote(
                organizationIsCrew: true,
                isAccountCrewMember: false
            ),
            "This household has Crew capacity."
        )
        XCTAssertNil(
            MembershipDisplay.householdCapacityNote(
                organizationIsCrew: true,
                isAccountCrewMember: true
            )
        )
    }
}
