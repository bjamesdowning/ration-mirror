import SwiftUI
import XCTest
@testable import Ration

@MainActor
final class TabDockContextTests: XCTestCase {
    func testSetActionIsIdempotentForSameTag() {
        let tabDock = TabDockContext()

        tabDock.setAction(for: 0) {
            Text("Scan")
        }
        XCTAssertEqual(tabDock.revision, 1)
        XCTAssertTrue(tabDock.hasAction(for: 0))

        tabDock.setAction(for: 0) {
            Text("Scan again")
        }
        XCTAssertEqual(tabDock.revision, 1, "Re-registering the same tab must not re-render the dock")
    }

    func testClearActionIncrementsRevisionOnlyWhenRemoved() {
        let tabDock = TabDockContext()
        tabDock.setAction(for: 1) { Text("Add") }

        tabDock.clearAction(for: 1)
        XCTAssertEqual(tabDock.revision, 2)
        XCTAssertFalse(tabDock.hasAction(for: 1))

        tabDock.clearAction(for: 1)
        XCTAssertEqual(tabDock.revision, 2, "Clearing a missing action is a no-op")
    }
}
