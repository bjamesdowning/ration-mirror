import XCTest
@testable import Ration

final class HubWidgetReorderIndexTests: XCTestCase {
    private let widgets = [
        HubWidgetLayout(id: "a", order: 0, size: "md", visible: true),
        HubWidgetLayout(id: "b", order: 1, size: "md", visible: true),
        HubWidgetLayout(id: "c", order: 2, size: "md", visible: true),
    ]

    private var frames: [String: CGRect] {
        [
            "a": CGRect(x: 0, y: 0, width: 320, height: 100),
            "b": CGRect(x: 0, y: 116, width: 320, height: 80),
            "c": CGRect(x: 0, y: 212, width: 320, height: 120),
        ]
    }

    func testDestinationIdReturnsWidgetBeforeNextMidpoint() {
        let destination = HubLayoutEngine.destinationId(
            forY: 90,
            frames: frames,
            order: widgets,
            excluding: "c"
        )
        XCTAssertEqual(destination, "b")
    }

    func testDestinationIdReturnsFirstWidgetWhenFingerIsAboveFirstMidpoint() {
        let destination = HubLayoutEngine.destinationId(
            forY: 40,
            frames: frames,
            order: widgets,
            excluding: "c"
        )
        XCTAssertEqual(destination, "a")
    }

    func testDestinationIdReturnsLastWidgetWhenFingerIsBelowAll() {
        let destination = HubLayoutEngine.destinationId(
            forY: 400,
            frames: frames,
            order: widgets,
            excluding: "a"
        )
        XCTAssertEqual(destination, "c")
    }

    func testDestinationIdExcludesDraggedWidget() {
        let destination = HubLayoutEngine.destinationId(
            forY: 150,
            frames: frames,
            order: widgets,
            excluding: "b"
        )
        XCTAssertNotEqual(destination, "b")
    }

    func testReorderDisplayOrderMovesWidgetToDestination() {
        let reordered = HubLayoutEngine.reorderDisplayOrder(widgets, moving: "c", to: "a")
        XCTAssertEqual(reordered.map(\.id), ["c", "a", "b"])
    }

    func testReorderDisplayOrderNoOpWhenSourceEqualsDestination() {
        let reordered = HubLayoutEngine.reorderDisplayOrder(widgets, moving: "b", to: "b")
        XCTAssertEqual(reordered.map(\.id), widgets.map(\.id))
    }
}
