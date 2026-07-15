import SwiftUI
import Observation

/// Holds the latest dock action builder so pushed factories always render current menu state.
@MainActor
final class TabDockActionHandle {
    private var builder: () -> AnyView = { AnyView(EmptyView()) }

    func update(_ builder: @escaping () -> AnyView) {
        self.builder = builder
    }

    func makeView() -> AnyView {
        builder()
    }
}

/// Per-tab action slot for the unified Copilot bottom dock (Hub scan, Galley +, etc.).
@MainActor
@Observable
final class TabDockContext {
    private(set) var revision = 0
    private(set) var contentEpoch = 0
    private var actionStacks: [Int: [() -> AnyView]] = [:]

    func pushAction<Content: View>(for tag: Int, @ViewBuilder content: @escaping () -> Content) {
        actionStacks[tag, default: []].append { AnyView(content()) }
        revision += 1
    }

    func popAction(for tag: Int) {
        guard var stack = actionStacks[tag], !stack.isEmpty else { return }
        stack.removeLast()
        if stack.isEmpty {
            actionStacks.removeValue(forKey: tag)
        } else {
            actionStacks[tag] = stack
        }
        revision += 1
    }

    func setAction<Content: View>(for tag: Int, @ViewBuilder content: @escaping () -> Content) {
        guard actionStacks[tag]?.isEmpty ?? true else { return }
        pushAction(for: tag, content: content)
    }

    func clearAction(for tag: Int) {
        guard actionStacks.removeValue(forKey: tag) != nil else { return }
        revision += 1
    }

    func bumpContentEpoch() {
        contentEpoch += 1
    }

    func action(for tag: Int) -> AnyView? {
        actionStacks[tag]?.last?()
    }

    func hasAction(for tag: Int) -> Bool {
        !(actionStacks[tag]?.isEmpty ?? true)
    }
}

private struct TabDockActionModifier<Action: View>: ViewModifier {
    @Environment(TabDockContext.self) private var tabDock
    let tag: Int
    let isActive: Bool
    @ViewBuilder let action: () -> Action
    @State private var actionHandle = TabDockActionHandle()
    @State private var isRegistered = false
    @State private var registeredTag: Int?

    func body(content: Content) -> some View {
        actionHandle.update { AnyView(action()) }

        return content
            .onAppear { sync() }
            .onChange(of: isActive) { _, _ in sync() }
            .onDisappear { unregisterFromDock() }
    }

    private func sync() {
        if isActive && !isRegistered {
            tabDock.pushAction(for: tag) { actionHandle.makeView() }
            isRegistered = true
            registeredTag = tag
        } else if !isActive && isRegistered {
            unregisterFromDock()
        }
    }

    private func unregisterFromDock() {
        guard isRegistered, let registeredTag else { return }
        tabDock.popAction(for: registeredTag)
        isRegistered = false
        self.registeredTag = nil
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
