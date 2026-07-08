import SwiftUI
import Observation

/// Per-tab action slot for the unified Copilot bottom dock (Hub scan, Galley +, etc.).
@MainActor
@Observable
final class TabDockContext {
    private(set) var revision = 0
    private var actionFactories: [Int: () -> AnyView] = [:]

    func setAction<Content: View>(for tag: Int, @ViewBuilder content: @escaping () -> Content) {
        // Idempotent — re-registering the same tab on every SwiftUI body pass
        // would otherwise ping @Observable and re-render the tab shell in a loop.
        guard actionFactories[tag] == nil else { return }
        actionFactories[tag] = { AnyView(content()) }
        revision += 1
    }

    func clearAction(for tag: Int) {
        guard actionFactories.removeValue(forKey: tag) != nil else { return }
        revision += 1
    }

    func action(for tag: Int) -> AnyView? {
        actionFactories[tag]?()
    }

    func hasAction(for tag: Int) -> Bool {
        actionFactories[tag] != nil
    }
}

private struct TabDockActionModifier<Action: View>: ViewModifier {
    @Environment(TabDockContext.self) private var tabDock
    let tag: Int
    let isActive: Bool
    @ViewBuilder let action: () -> Action

    func body(content: Content) -> some View {
        content
            .onAppear { sync() }
            .onChange(of: isActive) { _, _ in sync() }
            .onDisappear { tabDock.clearAction(for: tag) }
    }

    private func sync() {
        if isActive {
            tabDock.setAction(for: tag, content: action)
        } else {
            tabDock.clearAction(for: tag)
        }
    }
}

extension View {
    func tabDockAction<Action: View>(
        tag: Int,
        isActive: Bool = true,
        @ViewBuilder _ action: @escaping () -> Action
    ) -> some View {
        modifier(TabDockActionModifier(tag: tag, isActive: isActive, action: action))
    }
}
