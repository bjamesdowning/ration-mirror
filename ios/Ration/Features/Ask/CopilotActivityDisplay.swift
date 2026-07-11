import Foundation

enum CopilotActivityDisplay: Equatable {
    case hidden
    case thinking
    case tool(label: String, running: Bool, succeeded: Bool?)
}

enum CopilotActivityDisplayResolver {
    static func resolve(
        turnPhase: AskViewModel.TurnPhase,
        isTurnActive: Bool,
        activeToolName: String?,
        completedTool: AskViewModel.CompletedTool?,
        messages: [CopilotMessage]
    ) -> CopilotActivityDisplay {
        if turnPhase == .connecting {
            return .thinking
        }

        guard isTurnActive else { return .hidden }

        switch turnPhase {
        case .idle, .connecting:
            return .hidden
        case .thinking:
            if let completedTool {
                let phase: CopilotToolPhase = completedTool.succeeded ? .done : .error
                return .tool(
                    label: CopilotToolLabels.label(for: completedTool.toolName, phase: phase),
                    running: false,
                    succeeded: completedTool.succeeded
                )
            }
            return .thinking
        case .toolRunning:
            guard let activeToolName else { return .thinking }
            return .tool(
                label: CopilotToolLabels.label(for: activeToolName, phase: .running),
                running: true,
                succeeded: nil
            )
        case .toolDone:
            if let completedTool {
                let phase: CopilotToolPhase = completedTool.succeeded ? .done : .error
                return .tool(
                    label: CopilotToolLabels.label(for: completedTool.toolName, phase: phase),
                    running: false,
                    succeeded: completedTool.succeeded
                )
            }
            return .thinking
        case .streaming:
            guard showsThinkingDuringStreaming(messages: messages) else {
                return .hidden
            }
            return .thinking
        }
    }

    static func showsThinkingDuringStreaming(messages: [CopilotMessage]) -> Bool {
        guard let last = messages.last else { return true }
        guard last.role == "assistant" else { return true }
        return last.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
