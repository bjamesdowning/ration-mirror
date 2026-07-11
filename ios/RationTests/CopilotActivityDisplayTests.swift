import XCTest
@testable import Ration

final class CopilotActivityDisplayTests: XCTestCase {
    func testHiddenWhenIdle() {
        let display = CopilotActivityDisplayResolver.resolve(
            turnPhase: .idle,
            isTurnActive: false,
            activeToolName: nil,
            completedTool: nil,
            messages: []
        )
        XCTAssertEqual(display, .hidden)
    }

    func testThinkingWhileConnecting() {
        let display = CopilotActivityDisplayResolver.resolve(
            turnPhase: .connecting,
            isTurnActive: true,
            activeToolName: nil,
            completedTool: nil,
            messages: []
        )
        XCTAssertEqual(display, .thinking)
    }

    func testThinkingWhileConnectingBeforeTurnActive() {
        let display = CopilotActivityDisplayResolver.resolve(
            turnPhase: .connecting,
            isTurnActive: false,
            activeToolName: nil,
            completedTool: nil,
            messages: []
        )
        XCTAssertEqual(display, .thinking)
    }

    func testThinkingDuringStreamingBeforeAssistantContent() {
        let display = CopilotActivityDisplayResolver.resolve(
            turnPhase: .streaming,
            isTurnActive: true,
            activeToolName: nil,
            completedTool: nil,
            messages: [
                CopilotMessage(role: "user", content: "Hello"),
                CopilotMessage(role: "assistant", content: ""),
            ]
        )
        XCTAssertEqual(display, .thinking)
    }

    func testHiddenDuringStreamingOnceAssistantHasContent() {
        let display = CopilotActivityDisplayResolver.resolve(
            turnPhase: .streaming,
            isTurnActive: true,
            activeToolName: nil,
            completedTool: nil,
            messages: [
                CopilotMessage(role: "user", content: "Hello"),
                CopilotMessage(role: "assistant", content: "Hi there"),
            ]
        )
        XCTAssertEqual(display, .hidden)
    }

    func testRunningToolLabel() {
        let display = CopilotActivityDisplayResolver.resolve(
            turnPhase: .toolRunning,
            isTurnActive: true,
            activeToolName: "list_inventory",
            completedTool: nil,
            messages: []
        )
        XCTAssertEqual(
            display,
            .tool(label: "Checking your Cargo…", running: true, succeeded: nil)
        )
    }

    func testCompletedToolLabel() {
        let display = CopilotActivityDisplayResolver.resolve(
            turnPhase: .toolDone,
            isTurnActive: true,
            activeToolName: nil,
            completedTool: AskViewModel.CompletedTool(
                toolName: "list_inventory",
                label: "Checked Cargo",
                succeeded: true
            ),
            messages: []
        )
        XCTAssertEqual(
            display,
            .tool(label: "Checked Cargo", running: false, succeeded: true)
        )
    }
}

final class CopilotComposerHeightPolicyTests: XCTestCase {
    func testSingleLineDefaultHeight() {
        XCTAssertEqual(CopilotComposerHeightPolicy.clampedHeight(for: 20), 44)
    }

    func testClampsToMaxHeight() {
        XCTAssertEqual(CopilotComposerHeightPolicy.clampedHeight(for: 200), 120)
    }

    func testShouldDeferMeasurementUntilContainerHasWidth() {
        XCTAssertTrue(CopilotComposerHeightPolicy.shouldDeferMeasurement(width: 1))
        XCTAssertFalse(CopilotComposerHeightPolicy.shouldDeferMeasurement(width: 200))
    }
}
