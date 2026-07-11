import XCTest
@testable import Ration

final class CopilotTranscriptScrollPolicyTests: XCTestCase {
    func testDistanceIsZeroAtBottom() {
        let distance = CopilotTranscriptScrollPolicy.distanceFromBottom(
            contentHeight: 1_000,
            visibleBottom: 1_020,
            bottomInset: 20
        )

        XCTAssertEqual(distance, 0)
    }

    func testDistanceTracksUserPositionAboveBottom() {
        let distance = CopilotTranscriptScrollPolicy.distanceFromBottom(
            contentHeight: 1_000,
            visibleBottom: 700,
            bottomInset: 20
        )

        XCTAssertEqual(distance, 320)
    }
}
