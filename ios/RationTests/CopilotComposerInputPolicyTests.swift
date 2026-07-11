import XCTest
@testable import Ration

final class CopilotComposerInputPolicyTests: XCTestCase {
    func testStandaloneReturnRequestsSubmission() {
        XCTAssertTrue(CopilotComposerInputPolicy.shouldSubmit(replacementText: "\n"))
    }

    func testPastedMultilineTextDoesNotRequestSubmission() {
        XCTAssertFalse(
            CopilotComposerInputPolicy.shouldSubmit(
                replacementText: "First line\nSecond line\n"
            )
        )
    }

    func testPastedStandaloneLineBreakDoesNotRequestSubmission() {
        XCTAssertFalse(
            CopilotComposerInputPolicy.shouldSubmit(
                replacementText: "\n",
                isPasting: true
            )
        )
    }

    func testPlainTextDoesNotRequestSubmission() {
        XCTAssertFalse(
            CopilotComposerInputPolicy.shouldSubmit(replacementText: "Check cargo")
        )
    }
}
