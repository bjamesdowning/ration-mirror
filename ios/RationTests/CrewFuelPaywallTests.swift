import XCTest
@testable import Ration

final class CrewFuelPaywallTests: XCTestCase {
    func testCrewCopyMatchesThePaywallPhrase() {
        XCTAssertEqual(TierLimits.unlimitedFuelLogs, "Unlimited Fuel logs")
        XCTAssertEqual(TierLimits.fuelLogsRowLabel, "Fuel logs")
        XCTAssertEqual(TierLimits.freeMaxFuelLogs, 3)
    }

    func testFourthSavedListOpensTheCrewPaywall() {
        let capped = APIError.server(
            status: 403,
            message: "capacity_exceeded",
            code: nil,
            errorCode: "capacity_exceeded"
        )
        XCTAssertTrue(SavedListLogic.opensCrewPaywall(capped))

        let prefixed = APIError.server(
            status: 500,
            message: "capacity_exceeded:supplyLists:3:3",
            code: nil
        )
        XCTAssertTrue(SavedListLogic.opensCrewPaywall(prefixed))

        let other = APIError.server(status: 400, message: "Give the list a name.", code: nil)
        XCTAssertFalse(SavedListLogic.opensCrewPaywall(other))
    }
}
