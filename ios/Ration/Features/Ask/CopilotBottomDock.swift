import SwiftUI

/// Unified bottom dock: tab action FAB + Copilot input, stacked when expanded.
struct CopilotBottomDock: View {
    @Bindable var scrollContext: CopilotScrollContext
    @Bindable var tabDock: TabDockContext

    let selectedTab: Int
    @Binding var draft: String
    let isExhausted: Bool
    let isTurnActive: Bool
    let isStopping: Bool
    let isAwaitingApproval: Bool
    let onOpenSheet: () -> Void
    let onSend: (String) async -> Bool
    let onStop: () async -> Void
    let onExhaustedTap: () -> Void

    @FocusState private var isInputFocused: Bool
    @Namespace private var dockMorph

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
        CopilotComposerBar(
            draft: $draft,
            mode: .dock,
            isExhausted: isExhausted,
            isTurnActive: isTurnActive,
            isStopping: isStopping,
            isAwaitingApproval: isAwaitingApproval,
            focus: $isInputFocused,
            onOpenSheet: onOpenSheet,
            onSend: onSend,
            onStop: onStop,
            onExhaustedTap: onExhaustedTap
        )
        .matchedGeometryEffect(id: "copilotComposer", in: dockMorph)
        .transition(.opacity)
        .background {
            GeometryReader { geometry in
                Color.clear.preference(
                    key: CopilotComposerHeightPreferenceKey.self,
                    value: geometry.size.height
                )
            }
        }
        .onPreferenceChange(CopilotComposerHeightPreferenceKey.self) { height in
            scrollContext.setComposerHeight(height)
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
        .matchedGeometryEffect(id: "copilotComposer", in: dockMorph)
        .transition(.opacity)
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

}

private struct CopilotComposerHeightPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = CopilotDockLayout.expandedInputBarHeight

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
