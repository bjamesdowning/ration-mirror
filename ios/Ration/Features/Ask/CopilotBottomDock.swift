import SwiftUI

/// Unified bottom dock: tab action FAB + Copilot input, stacked when expanded.
struct CopilotBottomDock: View {
    @Bindable var scrollContext: CopilotScrollContext
    @Bindable var tabDock: TabDockContext

    let selectedTab: Int
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
        VStack(spacing: 0) {
            dockContent
                .padding(.horizontal, CopilotDockLayout.dockHorizontalPadding)
                .padding(.bottom, CopilotDockLayout.dockBottomPadding)

            bottomFade
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.86), value: scrollContext.isExpanded)
        .animation(.spring(response: 0.32, dampingFraction: 0.86), value: tabDock.revision)
        .task(id: placeholderIndex) {
            guard !UIAccessibility.isReduceMotionEnabled else { return }
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard !Task.isCancelled else { return }
            placeholderIndex = (placeholderIndex + 1) % placeholders.count
        }
    }

    @ViewBuilder
    private var dockContent: some View {
        if scrollContext.isExpanded {
            VStack(alignment: .trailing, spacing: CopilotDockLayout.dockRowSpacing) {
                if let action = tabDock.action(for: selectedTab) {
                    action
                }
                expandedBar
            }
        } else {
            HStack(alignment: .bottom, spacing: 12) {
                collapsedButton
                Spacer(minLength: 0)
                if let action = tabDock.action(for: selectedTab) {
                    action
                }
            }
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
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().stroke(Theme.hyperGreen.opacity(0.35), lineWidth: 1))
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private var collapsedButton: some View {
        Button {
            scrollContext.expandManually()
        } label: {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Color.black)
                .frame(width: CopilotDockLayout.collapsedChatChipSize, height: CopilotDockLayout.collapsedChatChipSize)
                .background(Theme.hyperGreen, in: Circle())
                .overlay(Circle().stroke(Theme.hyperGreen, lineWidth: 1))
        }
        .accessibilityLabel("Ask Ration")
        .transition(.scale.combined(with: .opacity))
    }

    private var bottomFade: some View {
        LinearGradient(
            colors: [
                Theme.ceramic.opacity(0),
                Theme.ceramic.opacity(0.55),
                Theme.ceramic.opacity(0.92),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .frame(height: 28)
        .allowsHitTesting(false)
    }

    private func submitDraft() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        draft = ""
        onSend(text)
    }
}
