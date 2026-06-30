import XCTest
@testable import Ration

final class HubLayoutEngineTests: XCTestCase {
    func testRowLimitBySize() {
        XCTAssertEqual(HubLayoutEngine.rowLimit(for: "sm"), 2)
        XCTAssertEqual(HubLayoutEngine.rowLimit(for: "md"), 4)
        XCTAssertEqual(HubLayoutEngine.rowLimit(for: "lg"), 6)
        XCTAssertEqual(HubLayoutEngine.rowLimit(for: nil), 4)
    }

    func testResolvedSizeFallsBackToDefault() {
        XCTAssertEqual(HubLayoutEngine.resolvedSize(nil, defaultSize: "md"), "md")
        XCTAssertEqual(HubLayoutEngine.resolvedSize("xl", defaultSize: "md"), "md")
        XCTAssertEqual(HubLayoutEngine.resolvedSize("sm", defaultSize: "lg"), "sm")
    }

    func testCookPresetIncludesManifestWidget() {
        let widgets = HubWidgetRegistry.preset(for: "cook")
        XCTAssertTrue(widgets.contains { $0.id == HubWidgetID.manifestPreview.rawValue })
        XCTAssertFalse(widgets.contains { $0.id == HubWidgetID.supplyPreview.rawValue && $0.visible })
    }
}
