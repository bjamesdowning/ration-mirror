import SwiftUI

/// Unified bottom dock: tab action FAB + Copilot input, stacked when expanded.
struct CopilotBottomDock: View {
    @Bindable var scrollContext: CopilotScrollContext
    @Bindable var tabDock: TabDockContext

    let selectedTab: Int
    let isExhausted: Bool
    let onOpenSheet: () -> Void
    let onSend: (String) -> Void
    let onExhaustedTap: () -> Void

    @State private var draft = ""
    @State private var hintIndex = 0
    @FocusState private var isInputFocused: Bool

    private let hintExamples = [
        "Add butter to my cargo",
        "Ask Ration what's for dinner",
        "What's expiring this week?",
        "Show meals I can cook tonight",
    ]

    var body: some View {
        // Align to the bottom without expanding hit testing across the full
        // TabView overlay (which would swallow tab-bar and content taps).
        VStack(spacing: 0) {
            dockContent
                .padding(.horizontal, CopilotDockLayout.dockHorizontalPadding)
                .padding(.bottom, CopilotDockLayout.dockBottomPadding)

            bottomFade
        }
        .frame(maxWidth: .infinity, alignment: .bottom)
        .fixedSize(horizontal: false, vertical: true)
        .animation(MotionPolicy.dockSpring, value: scrollContext.isExpanded)
        .animation(MotionPolicy.dockSpring, value: tabDock.revision)
        .onChange(of: scrollContext.isExpanded) { _, expanded in
            if !expanded {
                isInputFocused = false
            }
        }
        .onAppear {
            scrollContext.registerDismissKeyboardHandler { isInputFocused = false }
        }
        .onDisappear {
            scrollContext.registerDismissKeyboardHandler(nil)
        }
        .opacity(isExhausted ? 0.45 : 1)
        .task(id: hintIndex) {
            guard scrollContext.isExpanded, !UIAccessibility.isReduceMotionEnabled else { return }
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard !Task.isCancelled else { return }
            hintIndex = (hintIndex + 1) % hintExamples.count
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
        HStack(alignment: .center, spacing: 10) {
            Button(action: onOpenSheet) {
                Image(systemName: "sparkles")
                    .font(Typography.heroIcon(16))
                    .foregroundStyle(Theme.hyperGreen)
            }
            .accessibilityLabel("Open full Copilot chat")
            .disabled(isExhausted)

            TextField(
                "",
                text: $draft,
                prompt: Text(hintExamples[hintIndex]).foregroundStyle(Theme.muted)
            )
            .lineLimit(1)
            .textFieldStyle(.plain)
            .font(Typography.body())
            .foregroundStyle(Theme.carbon)
            .frame(height: 44)
            .submitLabel(.send)
            .focused($isInputFocused)
            .disabled(isExhausted)
            .accessibilityLabel("Ask Ration")
            .onSubmit { submitDraft() }

            Button(action: submitDraft) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(Typography.heroIcon(30))
                    .foregroundStyle(Theme.hyperGreen)
            }
            .opacity(
                isExhausted || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.35 : 1
            )
            .disabled(isExhausted || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityLabel("Send to Copilot")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background {
            RationAdaptiveMaterial(shape: AnyShape(Capsule()))
        }
        .overlay(Capsule().stroke(Theme.hyperGreen.opacity(0.35), lineWidth: 1))
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") {
                    isInputFocused = false
                }
            }
        }
    }

    private var collapsedButton: some View {
        Button {
            if isExhausted {
                onExhaustedTap()
            } else {
                onOpenSheet()
            }
        } label: {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(Typography.heroIcon(20))
                .foregroundStyle(Theme.onHyperGreen)
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
        guard !isExhausted else {
            onExhaustedTap()
            return
        }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        draft = ""
        isInputFocused = false
        onSend(text)
    }
}
