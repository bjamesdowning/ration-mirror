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

    @FocusState private var isComposerFocused: Bool
    @Namespace private var dockMorph

    var body: some View {
        dockContent
            .padding(.horizontal, CopilotDockLayout.dockHorizontalPadding)
            .padding(.bottom, CopilotDockLayout.dockBottomPadding)
            .padding(.bottom, CopilotDockLayout.tabBarClearance)
            .frame(maxWidth: .infinity, alignment: .bottom)
            .fixedSize(horizontal: false, vertical: true)
        .animation(MotionPolicy.dockSpring, value: tabDock.revision)
        .onChange(of: scrollContext.isExpanded) { _, expanded in
            if !expanded {
                isComposerFocused = false
                scrollContext.setComposerFocused(false)
            }
        }
        .onChange(of: isComposerFocused) { _, focused in
            scrollContext.setComposerFocused(focused)
        }
        .onAppear {
            scrollContext.registerDismissKeyboardHandler {
                isComposerFocused = false
            }
        }
        .onDisappear {
            scrollContext.registerDismissKeyboardHandler(nil)
            isComposerFocused = false
            scrollContext.setComposerFocused(false)
        }
    }

    @ViewBuilder
    private var dockContent: some View {
        let _ = tabDock.contentEpoch
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
            isFocused: $isComposerFocused,
            mode: .dock,
            isExhausted: isExhausted,
            isTurnActive: isTurnActive,
            isStopping: isStopping,
            isAwaitingApproval: isAwaitingApproval,
            onFocusChange: { scrollContext.setComposerFocused($0) },
            onDismissKeyboard: {
                isComposerFocused = false
                scrollContext.dismissKeyboard()
            },
            onOpenSheet: onOpenSheet,
            onSend: sendFromDock,
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
                scrollContext.expandManually()
                isComposerFocused = true
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

    private func sendFromDock(_ text: String) async -> Bool {
        isComposerFocused = false
        scrollContext.dismissKeyboard()
        return await onSend(text)
    }
}

private struct CopilotComposerHeightPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = CopilotDockLayout.expandedInputBarHeight

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
