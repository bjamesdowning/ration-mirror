import XCTest
@testable import Ration

final class HubLayoutEngineReorderTests: XCTestCase {
    func testReorderVisibleMovesWidgetAmongVisibleOnly() {
        let widgets = [
            HubWidgetLayout(id: "a", order: 0, size: "md", visible: true),
            HubWidgetLayout(id: "b", order: 1, size: "md", visible: false),
            HubWidgetLayout(id: "c", order: 2, size: "md", visible: true),
        ]
        let reordered = HubLayoutEngine.reorderVisible(widgets, moving: "c", to: "a")
        let visibleIds = reordered.filter(\.visible).map(\.id)
        XCTAssertEqual(visibleIds, ["c", "a"])
        XCTAssertEqual(reordered.first(where: { $0.id == "b" })?.visible, false)
    }
}
