import XCTest
@testable import Ration

final class BillingFulfillmentPollerTests: XCTestCase {
    func testCreditPackEarlyExitWhenCreditsRise() async throws {
        let baseline = billingStatus(credits: 5, crewActive: false)
        let fulfilled = billingStatus(credits: 17, crewActive: false)
        let counter = AttemptCounter()

        let result = try await BillingFulfillmentPoller.poll(
            baseline: baseline,
            creditPack: true,
            maxAttempts: 4,
            delayNanoseconds: 1,
            fetchStatus: {
                let attempt = await counter.increment()
                if attempt == 1 { return baseline }
                return fulfilled
            },
            sleep: { _ in }
        )

        XCTAssertEqual(result.credits, 17)
        let attempts = await counter.value
        XCTAssertEqual(attempts, 2)
    }

    func testCrewEarlyExitWhenEntitlementActive() async throws {
        let baseline = billingStatus(credits: 3, crewActive: false)
        let fulfilled = billingStatus(credits: 3, crewActive: true, accountTier: "crew_member")
        let counter = AttemptCounter()

        let result = try await BillingFulfillmentPoller.poll(
            baseline: baseline,
            creditPack: false,
            maxAttempts: 4,
            delayNanoseconds: 1,
            fetchStatus: {
                let attempt = await counter.increment()
                if attempt == 1 { return baseline }
                return fulfilled
            },
            sleep: { _ in }
        )

        XCTAssertTrue(result.isPersonalCrewActive)
        let attempts = await counter.value
        XCTAssertEqual(attempts, 2)
    }

    func testExhaustedPollsReturnsLatest() async throws {
        let baseline = billingStatus(credits: 2, crewActive: false)
        let latest = billingStatus(credits: 2, crewActive: false, tier: "free")
        let counter = AttemptCounter()

        let result = try await BillingFulfillmentPoller.poll(
            baseline: baseline,
            creditPack: true,
            maxAttempts: 3,
            delayNanoseconds: 1,
            fetchStatus: {
                _ = await counter.increment()
                return latest
            },
            sleep: { _ in }
        )

        XCTAssertEqual(result.credits, 2)
        XCTAssertEqual(result.tier, "free")
        // Initial fetch + maxAttempts refreshes
        let attempts = await counter.value
        XCTAssertEqual(attempts, 4)
    }

    func testFulfillmentVisibleCreditPack() {
        let baseline = billingStatus(credits: 10, crewActive: false)
        XCTAssertFalse(
            BillingFulfillmentPoller.fulfillmentVisible(
                billingStatus(credits: 10, crewActive: false),
                baseline: baseline,
                creditPack: true
            )
        )
        XCTAssertTrue(
            BillingFulfillmentPoller.fulfillmentVisible(
                billingStatus(credits: 11, crewActive: false),
                baseline: baseline,
                creditPack: true
            )
        )
    }

    func testFulfillmentVisibleCrew() {
        let baseline = billingStatus(credits: 0, crewActive: false)
        XCTAssertFalse(
            BillingFulfillmentPoller.fulfillmentVisible(
                billingStatus(credits: 0, crewActive: false),
                baseline: baseline,
                creditPack: false
            )
        )
        XCTAssertTrue(
            BillingFulfillmentPoller.fulfillmentVisible(
                billingStatus(credits: 0, crewActive: true, accountTier: "crew_member"),
                baseline: baseline,
                creditPack: false
            )
        )
    }

    func testHouseholdOnlyCrewDoesNotCountAsSubscriptionFulfillment() {
        // Organization may be Crew while the viewer remains personally free.
        // Entitlement active must reflect personal ownership only; if a stale
        // client somehow saw household access, transition still requires a change.
        let baseline = billingStatus(
            credits: 0,
            crewActive: false,
            accountTier: "free",
            organizationTier: "crew_member"
        )
        XCTAssertFalse(
            BillingFulfillmentPoller.fulfillmentVisible(
                billingStatus(
                    credits: 0,
                    crewActive: false,
                    accountTier: "free",
                    organizationTier: "crew_member"
                ),
                baseline: baseline,
                creditPack: false
            )
        )
        XCTAssertFalse(
            BillingFulfillmentPoller.fulfillmentVisible(
                billingStatus(credits: 0, crewActive: true, accountTier: "crew_member"),
                baseline: billingStatus(credits: 0, crewActive: true, accountTier: "crew_member"),
                creditPack: false
            ),
            "Already-active personal Crew must not early-exit as new fulfillment"
        )
    }

    // MARK: - Fixtures

    private func billingStatus(
        credits: Int,
        crewActive: Bool,
        tier: String = "free",
        accountTier: String? = "free",
        organizationTier: String? = nil
    ) -> BillingStatus {
        BillingStatus(
            tier: tier,
            entitlements: BillingStatus.Entitlements(
                crew_member: EntitlementInfo(active: crewActive, expiresAt: nil, store: nil)
            ),
            management: BillingManagement(store: nil, url: nil),
            canPurchaseSubscription: true,
            purchaseBlockReason: nil,
            billingUnavailable: false,
            credits: credits,
            accountTier: accountTier,
            accountTierExpired: false,
            organizationTier: organizationTier,
            organizationTierExpired: false
        )
    }
}

private actor AttemptCounter {
    private(set) var value = 0
    @discardableResult
    func increment() -> Int {
        value += 1
        return value
    }
}
