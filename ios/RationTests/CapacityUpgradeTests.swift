import Foundation
import XCTest
@testable import Ration

final class CapacityUpgradeTests: XCTestCase {
    func testAPIErrorIsCapacityExceededStructured() {
        let error = APIError.server(
            status: 403,
            message: "Tier limit reached",
            code: "capacity_exceeded",
            errorCode: "capacity_exceeded",
            limit: 35,
            resource: "cargo",
            current: 35
        )
        XCTAssertTrue(error.isCapacityExceeded)
        XCTAssertEqual(error.serverResource, "cargo")
        XCTAssertEqual(error.serverCurrent, 35)
        XCTAssertEqual(error.serverLimit, 35)
    }

    func testAPIErrorIsCapacityExceededPrefixForm() {
        let error = APIError.server(
            status: 403,
            message: "capacity_exceeded:35",
            code: nil,
            errorCode: "capacity_exceeded:35"
        )
        XCTAssertTrue(error.isCapacityExceeded)
    }

    func testAPIErrorIsFeatureGated() {
        let error = APIError.server(
            status: 403,
            message: "Upgrade required",
            code: "feature_gated",
            errorCode: "feature_gated"
        )
        XCTAssertTrue(error.isFeatureGated)
        XCTAssertFalse(error.isCapacityExceeded)
    }

    func testContextFromCapacityError() {
        let error = APIError.server(
            status: 403,
            message: nil,
            code: "capacity_exceeded",
            errorCode: "capacity_exceeded",
            limit: 15,
            resource: "meals",
            current: 15
        )
        let ctx = CapacityUpgrade.context(from: error)
        XCTAssertEqual(ctx?.trigger, .capacity)
        XCTAssertEqual(ctx?.resource, "meals")
        XCTAssertEqual(ctx?.current, 15)
        XCTAssertEqual(ctx?.limit, 15)
        XCTAssertEqual(ctx?.reasonTitle, "Meals capacity reached — 15/15")
        XCTAssertTrue(ctx?.prefersCrewFirst == true)
    }

    func testContextNilForUserCrewOwnedGroupCap() {
        let error = APIError.server(
            status: 403,
            message: nil,
            code: "capacity_exceeded",
            errorCode: "capacity_exceeded",
            limit: 5,
            resource: "owned_groups",
            current: 5,
            tier: "crew_member"
        )
        XCTAssertNil(CapacityUpgrade.context(from: error, isCrewMember: true))
        XCTAssertNil(CapacityUpgrade.context(from: error, isCrewMember: false))
    }

    func testContextPaywallForFreeUserEvenWhenGroupSessionIsCrew() {
        // Session isCrewMember reflects group owner; owned_groups uses user tier.
        let error = APIError.server(
            status: 403,
            message: nil,
            code: "capacity_exceeded",
            errorCode: "capacity_exceeded",
            limit: 1,
            resource: "owned_groups",
            current: 1,
            tier: "free"
        )
        let ctx = CapacityUpgrade.context(from: error, isCrewMember: true)
        XCTAssertEqual(ctx?.trigger, .capacity)
        XCTAssertEqual(ctx?.resource, "owned_groups")
        XCTAssertEqual(ctx?.limit, 1)
    }

    func testContextFromFeatureGateUsesDefaultResource() {
        let error = APIError.server(
            status: 403,
            message: nil,
            code: "feature_gated",
            errorCode: "feature_gated"
        )
        let ctx = CapacityUpgrade.context(from: error, defaultResource: "share")
        XCTAssertEqual(ctx?.trigger, .featureGate)
        XCTAssertEqual(ctx?.resource, "share")
        XCTAssertTrue(ctx?.reasonTitle?.contains("Sharing") == true)
    }

    func testBatchCapacityErrorStringForms() {
        XCTAssertNotNil(CapacityUpgrade.parseCapacityErrorString("capacity_exceeded"))
        let withLimit = CapacityUpgrade.parseCapacityErrorString("capacity_exceeded:35")
        XCTAssertEqual(withLimit?.limit, 35)

        let withResource = CapacityUpgrade.parseCapacityErrorString("capacity_exceeded:meals:15")
        XCTAssertEqual(withResource?.resource, "meals")
        XCTAssertEqual(withResource?.limit, 15)

        let fourPart = CapacityUpgrade.parseCapacityErrorString("capacity_exceeded:meals:14:15")
        XCTAssertEqual(fourPart?.resource, "meals")
        XCTAssertEqual(fourPart?.current, 14)
        XCTAssertEqual(fourPart?.limit, 15)

        XCTAssertNil(CapacityUpgrade.parseCapacityErrorString("unknown_error"))
    }

    func testContextFromBatchErrors() {
        let errors = [
            BatchCargoError(name: "milk", error: "capacity_exceeded:35"),
        ]
        let ctx = CapacityUpgrade.context(fromBatchErrors: errors)
        XCTAssertEqual(ctx?.trigger, .capacity)
        XCTAssertEqual(ctx?.resource, "cargo")
        XCTAssertEqual(ctx?.limit, 35)
    }

    func testCreditsContextPrefersCreditsFirst() {
        let ctx = PaywallContext.credits()
        XCTAssertFalse(ctx.prefersCrewFirst)
        XCTAssertEqual(ctx.trigger, .credits)
    }

    func testTierLimitsSoftWarning() {
        XCTAssertFalse(TierLimits.isSoftWarning(current: 20, limit: 35))
        XCTAssertTrue(TierLimits.isSoftWarning(current: 28, limit: 35))
        XCTAssertFalse(TierLimits.isSoftWarning(current: 35, limit: 35))
        XCTAssertTrue(TierLimits.isAtLimit(current: 35, limit: 35))
        XCTAssertNil(TierLimits.usagePercent(current: 10, limit: TierLimits.unlimited))
    }

    func testResourceLabelSupplyListsCamelCase() {
        XCTAssertEqual(CapacityUpgrade.resourceLabel("supplyLists"), "Supply lists")
        XCTAssertEqual(CapacityUpgrade.resourceLabel("meals"), "Meals")
    }

    func testAPIErrorBodyDecodesCapacityFieldsIncludingTier() throws {
        let data = """
        {
          "error": "capacity_exceeded",
          "code": "capacity_exceeded",
          "resource": "owned_groups",
          "current": 1,
          "limit": 1,
          "tier": "free",
          "upgradePath": "crew_member"
        }
        """.data(using: .utf8)!
        let body = try JSON.decoder.decode(APIErrorBody.self, from: data)
        XCTAssertEqual(body.error, "capacity_exceeded")
        XCTAssertEqual(body.resource, "owned_groups")
        XCTAssertEqual(body.current, 1)
        XCTAssertEqual(body.limit, 1)
        XCTAssertEqual(body.tier, "free")
    }

    func testIsUserAtCrewOwnedGroupCap() {
        XCTAssertTrue(CapacityUpgrade.isUserAtCrewOwnedGroupCap(tier: "crew_member", limit: 5))
        XCTAssertFalse(CapacityUpgrade.isUserAtCrewOwnedGroupCap(tier: "free", limit: 1))
        XCTAssertTrue(CapacityUpgrade.isUserAtCrewOwnedGroupCap(tier: nil, limit: 5))
        XCTAssertFalse(CapacityUpgrade.isUserAtCrewOwnedGroupCap(tier: nil, limit: 1))
    }
}
