import XCTest
@testable import Ration

@MainActor
final class AskCoordinatorTests: XCTestCase {
    func testDraftIsPreservedWithinOrganization() {
        let coordinator = AskCoordinator()
        coordinator.scopeDraft(to: "org-1")
        coordinator.draft = "Plan dinner"

        let didChange = coordinator.scopeDraft(to: "org-1")

        XCTAssertEqual(coordinator.draft, "Plan dinner")
        XCTAssertFalse(didChange)
    }

    func testDraftClearsWhenOrganizationChanges() {
        let coordinator = AskCoordinator()
        coordinator.scopeDraft(to: "org-1")
        coordinator.draft = "Private org prompt"

        let didChange = coordinator.scopeDraft(to: "org-2")

        XCTAssertEqual(coordinator.draft, "")
        XCTAssertTrue(didChange)
    }
}
