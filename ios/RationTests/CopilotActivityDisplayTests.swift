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
        XCTAssertEqual(CopilotComposerHeightPolicy.clampedHeight(for: 20), 36)
    }

    func testClampsToMaxHeight() {
        XCTAssertEqual(CopilotComposerHeightPolicy.clampedHeight(for: 400), 240)
    }

    func testMaxLineCountIsTen() {
        XCTAssertEqual(CopilotComposerHeightPolicy.maxLineCount, 10)
    }

    func testSingleLineMeasurementIgnoresExtraPadding() {
        let height = CopilotComposerHeightPolicy.measuredHeight(text: "", width: 240)
        XCTAssertEqual(height, CopilotComposerHeightPolicy.singleLineHeight)
    }

    func testMultilineMeasurementUsesBoundingRect() {
        let height = CopilotComposerHeightPolicy.measuredHeight(
            text: "Line one\nLine two",
            width: 240
        )
        XCTAssertGreaterThan(height, CopilotComposerHeightPolicy.singleLineHeight)
    }

    func testSoftWrappedTextGrowsWithoutHardNewlines() {
        let height = CopilotComposerHeightPolicy.measuredHeight(
            text: String(repeating: "prompt ", count: 40),
            width: 200
        )
        XCTAssertGreaterThan(height, CopilotComposerHeightPolicy.singleLineHeight)
    }

    func testMeasuredHeightIncludesFieldPaddingForSingleWrappedLine() {
        let height = CopilotComposerHeightPolicy.measuredHeight(text: "Eggs", width: 240)
        XCTAssertEqual(height, CopilotComposerHeightPolicy.singleLineHeight)
    }
}
