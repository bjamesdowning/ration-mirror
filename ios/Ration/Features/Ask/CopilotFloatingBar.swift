import SwiftUI

struct CopilotFloatingBar: View {
    @Environment(CopilotScrollContext.self) private var scrollContext

    let onOpenSheet: () -> Void
    let onSend: (String) -> Void

    @State private var draft = ""
    @State private var placeholderIndex = 0

    private let placeholders = [
        "Add butter to my cargo",
        "Ask Ration what's for dinner",
        "What's expiring this week?",
        "Show meals I can cook tonight",
    ]

    var body: some View {
        Group {
            if scrollContext.isExpanded {
                expandedBar
            } else {
                collapsedButton
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .task(id: placeholderIndex) {
            guard !UIAccessibility.isReduceMotionEnabled else { return }
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard !Task.isCancelled else { return }
            placeholderIndex = (placeholderIndex + 1) % placeholders.count
        }
    }

    private var expandedBar: some View {
        HStack(alignment: .bottom, spacing: 10) {
            Button(action: onOpenSheet) {
                Image(systemName: "sparkles")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.hyperGreen)
                    .padding(.bottom, 14)
            }
            .accessibilityLabel("Open full Copilot chat")

            TextField(placeholders[placeholderIndex], text: $draft, axis: .vertical)
                .lineLimit(1...3)
                .textFieldStyle(.plain)
                .font(Typography.body())
                .foregroundStyle(Theme.carbon)
                .submitLabel(.send)
                .onSubmit { submitDraft() }

            if !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button(action: submitDraft) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(Theme.hyperGreen)
                }
                .accessibilityLabel("Send to Copilot")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().stroke(Theme.hyperGreen.opacity(0.35), lineWidth: 1))
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private var collapsedButton: some View {
        HStack {
            Button {
                scrollContext.expandManually()
            } label: {
                Image(systemName: "bubble.left.and.bubble.right")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Color.black)
                    .frame(width: 48, height: 48)
                    .background(Theme.hyperGreen, in: Circle())
                    .overlay(Circle().stroke(Theme.hyperGreen, lineWidth: 1))
            }
            .accessibilityLabel("Ask Ration")

            Spacer()
        }
        .transition(.scale.combined(with: .opacity))
    }

    private func submitDraft() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        draft = ""
        onSend(text)
    }
}
