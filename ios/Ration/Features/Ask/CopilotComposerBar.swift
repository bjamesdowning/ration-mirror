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
    let focusToken: Int
    let dismissToken: Int
    let keyboardHeight: CGFloat
    let onFocusChange: (Bool) -> Void
    let onDismissDragProgress: (CGFloat) -> Void
    let onDismissKeyboard: () -> Void
    let onOpenSheet: () -> Void
    let onSend: (String) async -> Bool
    let onStop: () async -> Void
    let onExhaustedTap: () -> Void

    @State private var hintIndex = 0
    @State private var submissionInFlight = false
    @State private var contentHeight = CopilotComposerHeightPolicy.singleLineHeight
    @State private var isComposerFocused = false
    @State private var dismissDragOffset: CGFloat = 0

    private let hintExamples = [
        "Add butter to my cargo",
        "Ask Ration what's for dinner",
        "What's expiring this week?",
        "Show meals I can cook tonight",
    ]

    private var showsStopControl: Bool {
        isTurnActive && !isAwaitingApproval
    }

    private var placeholder: String {
        hintExamples[hintIndex]
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

            CopilotGrowingTextView(
                text: $draft,
                placeholder: placeholder,
                isEnabled: !isExhausted,
                focusToken: focusToken,
                dismissToken: dismissToken,
                onFocusChange: { focused in
                    isComposerFocused = focused
                    onFocusChange(focused)
                },
                onHeightChange: { height in
                    contentHeight = height
                },
                onSubmit: submitDraft
            )
            .frame(height: contentHeight)
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
        .background {
            CopilotComposerDismissGestureBridge(
                isEnabled: isComposerFocused,
                keyboardHeight: keyboardHeight,
                onDismissDragProgress: { progress in
                    let height = max(keyboardHeight, CopilotKeyboardDismissPolicy.minimumDismissDistance * 4)
                    dismissDragOffset = progress * height * 0.35
                    onDismissDragProgress(progress)
                },
                onDismissKeyboard: {
                    dismissDragOffset = 0
                    onDismissDragProgress(0)
                    onDismissKeyboard()
                },
                onDismissDragReset: {
                    dismissDragOffset = 0
                    onDismissDragProgress(0)
                }
            )
        }
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Theme.hyperGreen.opacity(0.35), lineWidth: 1)
        }
        .offset(y: dismissDragOffset)
        .opacity(isExhausted && !isTurnActive ? 0.45 : 1)
        .onChange(of: dismissToken) { _, _ in
            dismissDragOffset = 0
        }
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
                contentHeight = CopilotComposerHeightPolicy.singleLineHeight
            }
            submissionInFlight = false
        }
    }
}
