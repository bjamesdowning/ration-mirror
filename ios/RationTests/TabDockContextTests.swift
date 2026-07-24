import SwiftUI
import XCTest
@testable import Ration

@MainActor
final class TabDockContextTests: XCTestCase {
    func testPushActionRegistersAndIncrementsRevision() {
        let tabDock = TabDockContext()

        tabDock.pushAction(for: .hub) {
            Text("Scan")
        }
        XCTAssertEqual(tabDock.revision, 1)
        XCTAssertTrue(tabDock.hasAction(for: .hub))
    }

    func testSecondPushOnSameTagReplacesTopAction() {
        let tabDock = TabDockContext()
        tabDock.pushAction(for: .cargo) { Text("Add") }

        tabDock.pushAction(for: .cargo) { Text("Detail") }
        XCTAssertEqual(tabDock.revision, 2)
        XCTAssertTrue(tabDock.hasAction(for: .cargo))
    }

    func testPopRestoresPreviousAction() {
        let tabDock = TabDockContext()
        tabDock.pushAction(for: .cargo) { Text("Add") }
        tabDock.pushAction(for: .cargo) { Text("Detail") }

        tabDock.popAction(for: .cargo)
        XCTAssertEqual(tabDock.revision, 3)
        XCTAssertTrue(tabDock.hasAction(for: .cargo))
    }

    func testPopUntilEmptyRemovesAction() {
        let tabDock = TabDockContext()
        tabDock.pushAction(for: .galley) { Text("Only") }

        tabDock.popAction(for: .galley)
        XCTAssertEqual(tabDock.revision, 2)
        XCTAssertFalse(tabDock.hasAction(for: .galley))
    }

    func testPopEmptyStackIsNoOp() {
        let tabDock = TabDockContext()
        tabDock.popAction(for: .manifest)
        XCTAssertEqual(tabDock.revision, 0)
        XCTAssertFalse(tabDock.hasAction(for: .manifest))
    }

    func testSetActionIsIdempotentWhenStackNonEmpty() {
        let tabDock = TabDockContext()
        tabDock.pushAction(for: .hub) { Text("Scan") }

        tabDock.setAction(for: .hub) { Text("Scan again") }
        XCTAssertEqual(tabDock.revision, 1, "setAction must not push when stack already has an entry")
    }

    func testClearActionRemovesEntireStack() {
        let tabDock = TabDockContext()
        tabDock.pushAction(for: .cargo) { Text("Add") }
        tabDock.pushAction(for: .cargo) { Text("Detail") }

        tabDock.clearAction(for: .cargo)
        XCTAssertEqual(tabDock.revision, 3)
        XCTAssertFalse(tabDock.hasAction(for: .cargo))

        tabDock.clearAction(for: .cargo)
        XCTAssertEqual(tabDock.revision, 3, "Clearing a missing action is a no-op")
    }

    func testBumpContentEpochIncrementsWithoutStackRevision() {
        let tabDock = TabDockContext()
        tabDock.pushAction(for: .hub) { Text("Scan") }
        let revisionAfterPush = tabDock.revision

        tabDock.bumpContentEpoch()
        XCTAssertEqual(tabDock.contentEpoch, 1)
        XCTAssertEqual(tabDock.revision, revisionAfterPush, "Content refresh must not animate dock layout")
    }

    func testPopWrongTagDoesNotAffectOtherTagStack() {
        let tabDock = TabDockContext()
        tabDock.pushAction(for: .galley) { Text("Galley") }

        tabDock.popAction(for: .cargo)

        XCTAssertTrue(tabDock.hasAction(for: .galley), "Popping an empty/wrong tag must not drain another tab's stack")
    }
}
