import XCTest
@testable import Ration

final class HubLayoutEngineTests: XCTestCase {
    func testDisplayLimitPrefersFiltersThenClamps() {
        XCTAssertEqual(HubLayoutEngine.displayLimit(filters: nil), 6)
        XCTAssertEqual(
            HubLayoutEngine.displayLimit(filters: HubWidgetFilters(limit: 10)),
            10
        )
        XCTAssertEqual(
            HubLayoutEngine.displayLimit(filters: HubWidgetFilters(limit: 1)),
            2
        )
        XCTAssertEqual(
            HubLayoutEngine.displayLimit(filters: HubWidgetFilters(limit: 20)),
            12
        )
    }

    func testDisplayLimitFallsBackToLegacySize() {
        XCTAssertEqual(HubLayoutEngine.displayLimit(filters: nil, size: "sm"), 2)
        XCTAssertEqual(HubLayoutEngine.displayLimit(filters: nil, size: "md"), 4)
        XCTAssertEqual(HubLayoutEngine.displayLimit(filters: nil, size: "lg"), 6)
        XCTAssertEqual(
            HubLayoutEngine.displayLimit(filters: HubWidgetFilters(limit: 10), size: "sm"),
            10
        )
    }

    func testSizeForLimitThresholds() {
        XCTAssertEqual(HubLayoutEngine.sizeForLimit(2), "sm")
        XCTAssertEqual(HubLayoutEngine.sizeForLimit(3), "md")
        XCTAssertEqual(HubLayoutEngine.sizeForLimit(4), "md")
        XCTAssertEqual(HubLayoutEngine.sizeForLimit(5), "lg")
        XCTAssertEqual(HubLayoutEngine.sizeForLimit(12), "lg")
    }

    func testSizeForDaySpan() {
        XCTAssertEqual(HubLayoutEngine.sizeForDaySpan(1), "sm")
        XCTAssertEqual(HubLayoutEngine.sizeForDaySpan(3), "md")
        XCTAssertEqual(HubLayoutEngine.sizeForDaySpan(7), "lg")
        XCTAssertEqual(HubLayoutEngine.sizeForDaySpan(14), "lg")
    }

    func testResolvedDaySpan() {
        XCTAssertEqual(HubLayoutEngine.resolvedDaySpan(filters: nil), 3)
        XCTAssertEqual(
            HubLayoutEngine.resolvedDaySpan(filters: HubWidgetFilters(daySpan: 14)),
            14
        )
        XCTAssertEqual(
            HubLayoutEngine.resolvedDaySpan(filters: HubWidgetFilters(daySpan: 9)),
            3
        )
    }

    func testResolvedSizeFallsBackToDefault() {
        XCTAssertEqual(HubLayoutEngine.resolvedSize(nil, defaultSize: "md"), "md")
        XCTAssertEqual(HubLayoutEngine.resolvedSize("xl", defaultSize: "md"), "md")
        XCTAssertEqual(HubLayoutEngine.resolvedSize("sm", defaultSize: "lg"), "sm")
    }

    func testDensitySummaryForListAndManifest() {
        let supply = HubWidgetLayout(
            id: HubWidgetID.supplyPreview.rawValue,
            order: 0,
            size: "md",
            visible: true,
            filters: HubWidgetFilters(limit: 8, supplyTags: ["produce"])
        )
        XCTAssertEqual(HubLayoutEngine.densitySummary(for: supply), "Show 8 · Tags")

        let manifest = HubWidgetLayout(
            id: HubWidgetID.manifestPreview.rawValue,
            order: 1,
            size: "lg",
            visible: true,
            filters: HubWidgetFilters(slotType: "dinner", daySpan: 1)
        )
        XCTAssertEqual(HubLayoutEngine.densitySummary(for: manifest), "Today · Dinner")

        let stats = HubWidgetLayout(
            id: HubWidgetID.hubStats.rawValue,
            order: 2,
            size: "sm",
            visible: true
        )
        XCTAssertEqual(HubLayoutEngine.densitySummary(for: stats), "Compact layout")
    }

    func testCookPresetIncludesManifestWidget() {
        let widgets = HubWidgetRegistry.preset(for: "cook")
        XCTAssertTrue(widgets.contains { $0.id == HubWidgetID.manifestPreview.rawValue })
        XCTAssertFalse(widgets.contains { $0.id == HubWidgetID.supplyPreview.rawValue && $0.visible })
    }
}
