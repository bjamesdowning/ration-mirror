import XCTest
@testable import Ration

final class HubLayoutEngineReorderTests: XCTestCase {
    func testReindexOrderAssignsContiguousOrders() {
        let widgets = [
            HubWidgetLayout(id: "c", order: 9, size: "md", visible: true),
            HubWidgetLayout(id: "a", order: 2, size: "sm", visible: false),
            HubWidgetLayout(id: "b", order: 5, size: "lg", visible: true),
        ]
        let reindexed = HubLayoutEngine.reindexOrder(widgets)
        XCTAssertEqual(reindexed.map(\.id), ["c", "a", "b"])
        XCTAssertEqual(reindexed.map(\.order), [0, 1, 2])
        XCTAssertEqual(reindexed.map(\.visible), [true, false, true])
        XCTAssertEqual(reindexed.map(\.size), [Optional("md"), Optional("sm"), Optional("lg")])
    }

    func testMoveWidgetSwapsNeighborsAndReindexes() {
        let widgets = [
            HubWidgetLayout(id: "a", order: 0, size: "md", visible: true),
            HubWidgetLayout(id: "b", order: 1, size: "md", visible: false),
            HubWidgetLayout(id: "c", order: 2, size: "md", visible: true),
        ]
        let moved = HubLayoutEngine.moveWidget(widgets, id: "c", direction: .up)
        XCTAssertEqual(moved.map(\.id), ["a", "c", "b"])
        XCTAssertEqual(moved.map(\.order), [0, 1, 2])
    }
}
