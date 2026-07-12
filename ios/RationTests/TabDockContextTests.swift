import SwiftUI
import XCTest
@testable import Ration

@MainActor
final class TabDockContextTests: XCTestCase {
    func testPushActionRegistersAndIncrementsRevision() {
        let tabDock = TabDockContext()

        tabDock.pushAction(for: 0) {
            Text("Scan")
        }
        XCTAssertEqual(tabDock.revision, 1)
        XCTAssertTrue(tabDock.hasAction(for: 0))
    }

    func testSecondPushOnSameTagReplacesTopAction() {
        let tabDock = TabDockContext()
        tabDock.pushAction(for: 1) { Text("Add") }

        tabDock.pushAction(for: 1) { Text("Detail") }
        XCTAssertEqual(tabDock.revision, 2)
        XCTAssertTrue(tabDock.hasAction(for: 1))
    }

    func testPopRestoresPreviousAction() {
        let tabDock = TabDockContext()
        tabDock.pushAction(for: 1) { Text("Add") }
        tabDock.pushAction(for: 1) { Text("Detail") }

        tabDock.popAction(for: 1)
        XCTAssertEqual(tabDock.revision, 3)
        XCTAssertTrue(tabDock.hasAction(for: 1))
    }

    func testPopUntilEmptyRemovesAction() {
        let tabDock = TabDockContext()
        tabDock.pushAction(for: 2) { Text("Only") }

        tabDock.popAction(for: 2)
        XCTAssertEqual(tabDock.revision, 2)
        XCTAssertFalse(tabDock.hasAction(for: 2))
    }

    func testPopEmptyStackIsNoOp() {
        let tabDock = TabDockContext()
        tabDock.popAction(for: 3)
        XCTAssertEqual(tabDock.revision, 0)
        XCTAssertFalse(tabDock.hasAction(for: 3))
    }

    func testSetActionIsIdempotentWhenStackNonEmpty() {
        let tabDock = TabDockContext()
        tabDock.pushAction(for: 0) { Text("Scan") }

        tabDock.setAction(for: 0) { Text("Scan again") }
        XCTAssertEqual(tabDock.revision, 1, "setAction must not push when stack already has an entry")
    }

    func testClearActionRemovesEntireStack() {
        let tabDock = TabDockContext()
        tabDock.pushAction(for: 1) { Text("Add") }
        tabDock.pushAction(for: 1) { Text("Detail") }

        tabDock.clearAction(for: 1)
        XCTAssertEqual(tabDock.revision, 3)
        XCTAssertFalse(tabDock.hasAction(for: 1))

        tabDock.clearAction(for: 1)
        XCTAssertEqual(tabDock.revision, 3, "Clearing a missing action is a no-op")
    }

    func testBumpContentEpochIncrementsWithoutStackRevision() {
        let tabDock = TabDockContext()
        tabDock.pushAction(for: 0) { Text("Scan") }
        let revisionAfterPush = tabDock.revision

        tabDock.bumpContentEpoch()
        XCTAssertEqual(tabDock.contentEpoch, 1)
        XCTAssertEqual(tabDock.revision, revisionAfterPush, "Content refresh must not animate dock layout")
    }
}
