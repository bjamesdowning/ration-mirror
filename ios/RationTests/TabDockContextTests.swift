import SwiftUI
import XCTest
@testable import Ration

@MainActor
final class TabDockContextTests: XCTestCase {
    func testRootLayerRegistersAndIncrementsRevision() {
        let tabDock = TabDockContext()

        tabDock.setLayerAction(for: .hub, layer: .root) {
            Text("Scan")
        }
        XCTAssertEqual(tabDock.revision, 1)
        XCTAssertTrue(tabDock.hasAction(for: .hub))
        XCTAssertTrue(tabDock.hasAction(for: .hub, layer: .root))
    }

    func testDetailLayerTakesPriorityOverRoot() {
        let tabDock = TabDockContext()
        tabDock.setLayerAction(for: .cargo, layer: .root) { Text("Add") }
        tabDock.setLayerAction(for: .cargo, layer: .detail) { Text("Detail") }

        XCTAssertTrue(tabDock.hasAction(for: .cargo, layer: .root))
        XCTAssertTrue(tabDock.hasAction(for: .cargo, layer: .detail))
        XCTAssertEqual(tabDock.revision, 2)
    }

    func testClearingDetailRestoresRootWithoutPoppingIt() {
        let tabDock = TabDockContext()
        tabDock.setLayerAction(for: .cargo, layer: .root) { Text("Add") }
        tabDock.setLayerAction(for: .cargo, layer: .detail) { Text("Detail") }

        tabDock.clearLayerAction(for: .cargo, layer: .detail)
        XCTAssertEqual(tabDock.revision, 3)
        XCTAssertTrue(tabDock.hasAction(for: .cargo, layer: .root))
        XCTAssertFalse(tabDock.hasAction(for: .cargo, layer: .detail))
        XCTAssertTrue(tabDock.hasAction(for: .cargo))
    }

    func testClearingRootWhileDetailPresentKeepsDetail() {
        let tabDock = TabDockContext()
        tabDock.setLayerAction(for: .galley, layer: .root) { Text("Add") }
        tabDock.setLayerAction(for: .galley, layer: .detail) { Text("Meal") }

        tabDock.clearLayerAction(for: .galley, layer: .root)
        XCTAssertTrue(tabDock.hasAction(for: .galley, layer: .detail))
        XCTAssertFalse(tabDock.hasAction(for: .galley, layer: .root))
        XCTAssertTrue(tabDock.hasAction(for: .galley))
    }

    func testClearLayerUntilEmptyRemovesAction() {
        let tabDock = TabDockContext()
        tabDock.setLayerAction(for: .galley, layer: .root) { Text("Only") }

        tabDock.clearLayerAction(for: .galley, layer: .root)
        XCTAssertEqual(tabDock.revision, 2)
        XCTAssertFalse(tabDock.hasAction(for: .galley))
    }

    func testClearMissingLayerIsNoOp() {
        let tabDock = TabDockContext()
        tabDock.clearLayerAction(for: .manifest, layer: .detail)
        XCTAssertEqual(tabDock.revision, 0)
        XCTAssertFalse(tabDock.hasAction(for: .manifest))
    }

    func testClearActionRemovesAllLayers() {
        let tabDock = TabDockContext()
        tabDock.setLayerAction(for: .cargo, layer: .root) { Text("Add") }
        tabDock.setLayerAction(for: .cargo, layer: .detail) { Text("Detail") }

        tabDock.clearAction(for: .cargo)
        XCTAssertEqual(tabDock.revision, 3)
        XCTAssertFalse(tabDock.hasAction(for: .cargo))

        tabDock.clearAction(for: .cargo)
        XCTAssertEqual(tabDock.revision, 3, "Clearing a missing action is a no-op")
    }

    func testBumpContentEpochIncrementsWithoutStackRevision() {
        let tabDock = TabDockContext()
        tabDock.setLayerAction(for: .hub, layer: .root) { Text("Scan") }
        let revisionAfterPush = tabDock.revision

        tabDock.bumpContentEpoch()
        XCTAssertEqual(tabDock.contentEpoch, 1)
        XCTAssertEqual(tabDock.revision, revisionAfterPush, "Content refresh must not animate dock layout")
    }

    func testClearWrongTagDoesNotAffectOtherTab() {
        let tabDock = TabDockContext()
        tabDock.setLayerAction(for: .galley, layer: .root) { Text("Galley") }

        tabDock.clearLayerAction(for: .cargo, layer: .root)

        XCTAssertTrue(tabDock.hasAction(for: .galley), "Clearing an empty/wrong tag must not drain another tab's layers")
    }

    func testReplacingSameLayerBumpsRevision() {
        let tabDock = TabDockContext()
        tabDock.setLayerAction(for: .hub, layer: .root) { Text("Scan") }
        tabDock.setLayerAction(for: .hub, layer: .root) { Text("Scan again") }
        XCTAssertEqual(tabDock.revision, 2)
        XCTAssertTrue(tabDock.hasAction(for: .hub, layer: .root))
    }
}
