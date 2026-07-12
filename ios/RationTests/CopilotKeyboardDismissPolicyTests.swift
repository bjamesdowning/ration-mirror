import XCTest
@testable import Ration

final class CopilotKeyboardDismissPolicyTests: XCTestCase {
    func testVerticalDownDragDominatesHorizontal() {
        XCTAssertTrue(
            CopilotKeyboardDismissPolicy.isVerticalDownDrag(
                translation: CGSize(width: 4, height: 30)
            )
        )
    }

    func testHorizontalDragIsNotVerticalDown() {
        XCTAssertFalse(
            CopilotKeyboardDismissPolicy.isVerticalDownDrag(
                translation: CGSize(width: 40, height: 10)
            )
        )
    }

    func testShouldDismissWhenDistanceMeetsThreshold() {
        XCTAssertTrue(
            CopilotKeyboardDismissPolicy.shouldDismissKeyboard(
                translation: CGSize(width: 2, height: 24)
            )
        )
    }

    func testShouldNotDismissWhenDistanceBelowThreshold() {
        XCTAssertFalse(
            CopilotKeyboardDismissPolicy.shouldDismissKeyboard(
                translation: CGSize(width: 2, height: 20)
            )
        )
    }

    func testDismissProgressScalesWithKeyboardHeight() {
        XCTAssertEqual(
            CopilotKeyboardDismissPolicy.dismissProgress(translation: 168, keyboardHeight: 336),
            0.5,
            accuracy: 0.001
        )
    }

    func testDismissProgressClampsAtOne() {
        XCTAssertEqual(
            CopilotKeyboardDismissPolicy.dismissProgress(translation: 500, keyboardHeight: 336),
            1,
            accuracy: 0.001
        )
    }

    func testDismissProgressIsZeroForUpwardDrag() {
        XCTAssertEqual(
            CopilotKeyboardDismissPolicy.dismissProgress(translation: -20, keyboardHeight: 336),
            0,
            accuracy: 0.001
        )
    }
}
