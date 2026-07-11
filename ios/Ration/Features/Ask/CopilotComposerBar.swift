import SwiftUI

enum CopilotComposerInputPolicy {
    static func shouldSubmit(replacementText: String, isPasting: Bool = false) -> Bool {
        !isPasting && (replacementText == "\n" || replacementText == "\r")
    }
}

struct CopilotComposerBar: View {
    enum Mode {
        case dock
        case sheet
    }

    @Binding var draft: String
    let mode: Mode
    let isExhausted: Bool
    let isTurnActive: Bool
    let isStopping: Bool
    let isAwaitingApproval: Bool
    let focus: FocusState<Bool>.Binding
    let onOpenSheet: () -> Void
    let onSend: (String) async -> Bool
    let onStop: () async -> Void
    let onExhaustedTap: () -> Void

    @State private var hintIndex = 0
    @State private var submissionInFlight = false

    private let hintExamples = [
        "Add butter to my cargo",
        "Ask Ration what's for dinner",
        "What's expiring this week?",
        "Show meals I can cook tonight",
    ]

    private var showsStopControl: Bool {
        isTurnActive && !isAwaitingApproval
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            if mode == .dock {
                Button(action: onOpenSheet) {
                    Image(systemName: "sparkles")
                        .font(Typography.heroIcon(16))
                        .foregroundStyle(Theme.hyperGreen)
                        .frame(minHeight: 44)
                }
                .accessibilityLabel("Open full Copilot chat")
                .disabled(isExhausted)
            }

            ZStack(alignment: .leading) {
                if draft.isEmpty {
                    Text(hintExamples[hintIndex])
                        .font(Typography.body())
                        .foregroundStyle(Theme.muted)
                        .padding(.vertical, 11)
                        .allowsHitTesting(false)
                }
                CopilotGrowingTextView(
                    text: $draft,
                    isFocused: Binding(
                        get: { focus.wrappedValue },
                        set: { focus.wrappedValue = $0 }
                    ),
                    isEnabled: !isExhausted,
                    onSubmit: submitDraft
                )
            }
            .frame(minHeight: 44, maxHeight: 120, alignment: .leading)
            .accessibilityLabel("Ask Ration")

            Button {
                if showsStopControl {
                    Task { await onStop() }
                } else {
                    submitDraft()
                }
            } label: {
                Image(systemName: showsStopControl ? "stop.circle.fill" : "arrow.up.circle.fill")
                    .font(Typography.heroIcon(30))
                    .foregroundStyle(showsStopControl ? Theme.warning : Theme.hyperGreen)
                    .frame(minHeight: 44)
            }
            .opacity(isActionDisabled ? 0.35 : 1)
            .disabled(isActionDisabled)
            .accessibilityLabel(showsStopControl ? "Stop Copilot response" : "Send to Copilot")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background {
            RationAdaptiveMaterial(
                shape: AnyShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            )
        }
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Theme.hyperGreen.opacity(0.35), lineWidth: 1)
        }
        .simultaneousGesture(
            DragGesture(minimumDistance: 16).onEnded { value in
                let translation = value.translation
                if translation.height > 20, abs(translation.height) > abs(translation.width) {
                    focus.wrappedValue = false
                }
            }
        )
        .opacity(isExhausted && !isTurnActive ? 0.45 : 1)
        .task(id: hintIndex) {
            guard !UIAccessibility.isReduceMotionEnabled else { return }
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard !Task.isCancelled else { return }
            hintIndex = (hintIndex + 1) % hintExamples.count
        }
    }

    private var isActionDisabled: Bool {
        if showsStopControl {
            return isStopping
        }
        return submissionInFlight
            || isExhausted
            || isAwaitingApproval
            || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submitDraft() {
        guard !submissionInFlight, !isTurnActive, !isAwaitingApproval else { return }
        guard !isExhausted else {
            onExhaustedTap()
            return
        }
        let originalDraft = draft
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        submissionInFlight = true
        Task {
            let accepted = await onSend(text)
            if accepted, draft == originalDraft {
                draft = ""
            }
            if accepted, mode == .dock {
                focus.wrappedValue = false
            }
            submissionInFlight = false
        }
    }
}
