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

/// Independent slots per tab so a detail `⋯` cannot be LIFO-popped off a list `+`.
/// TabView hides inactive tabs with `onDisappear`, which used to pop the detail
/// action and leave the list FAB on top after a cross-tab deep link.
enum TabDockLayer: Int, Comparable, Sendable {
    case root = 0
    case detail = 1

    static func < (lhs: TabDockLayer, rhs: TabDockLayer) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

private struct CurrentMainTabKey: EnvironmentKey {
    static let defaultValue: MainTab? = nil
}

extension EnvironmentValues {
    /// The TabView selection driving Copilot dock actions. Independent of
    /// `activatedTabs` (which is sticky for data loading).
    var currentMainTab: MainTab? {
        get { self[CurrentMainTabKey.self] }
        set { self[CurrentMainTabKey.self] = newValue }
    }
}

/// Per-tab action slot for the unified Copilot bottom dock (Hub scan, Galley +, etc.).
@MainActor
@Observable
final class TabDockContext {
    private(set) var revision = 0
    private(set) var contentEpoch = 0
    private var layerActions: [MainTab: [TabDockLayer: () -> AnyView]] = [:]

    func setLayerAction<Content: View>(
        for tag: MainTab,
        layer: TabDockLayer,
        @ViewBuilder content: @escaping () -> Content
    ) {
        var layers = layerActions[tag] ?? [:]
        layers[layer] = { AnyView(content()) }
        layerActions[tag] = layers
        revision += 1
    }

    func clearLayerAction(for tag: MainTab, layer: TabDockLayer) {
        guard var layers = layerActions[tag], layers.removeValue(forKey: layer) != nil else {
            return
        }
        if layers.isEmpty {
            layerActions.removeValue(forKey: tag)
        } else {
            layerActions[tag] = layers
        }
        revision += 1
    }

    func clearAction(for tag: MainTab) {
        guard layerActions.removeValue(forKey: tag) != nil else { return }
        revision += 1
    }

    func bumpContentEpoch() {
        contentEpoch += 1
    }

    func action(for tag: MainTab) -> AnyView? {
        guard let layers = layerActions[tag], let top = layers.keys.max() else {
            return nil
        }
        return layers[top]?()
    }

    func hasAction(for tag: MainTab) -> Bool {
        !(layerActions[tag]?.isEmpty ?? true)
    }

    func hasAction(for tag: MainTab, layer: TabDockLayer) -> Bool {
        layerActions[tag]?[layer] != nil
    }
}

private struct TabDockActionModifier<Action: View>: ViewModifier {
    @Environment(TabDockContext.self) private var tabDock
    let tag: MainTab
    let layer: TabDockLayer
    let isActive: Bool
    @ViewBuilder let action: () -> Action
    @State private var actionHandle = TabDockActionHandle()
    @State private var isRegistered = false
    @State private var registeredTag: MainTab?

    func body(content: Content) -> some View {
        actionHandle.update { AnyView(action()) }

        return content
            .onAppear { sync() }
            .onChange(of: isActive) { _, _ in sync() }
            .onDisappear { unregisterFromDock() }
    }

    private func sync() {
        if isActive && !isRegistered {
            tabDock.setLayerAction(for: tag, layer: layer) { actionHandle.makeView() }
            isRegistered = true
            registeredTag = tag
        } else if !isActive && isRegistered {
            unregisterFromDock()
        }
    }

    private func unregisterFromDock() {
        guard isRegistered, let registeredTag else { return }
        tabDock.clearLayerAction(for: registeredTag, layer: layer)
        isRegistered = false
        self.registeredTag = nil
    }
}

extension View {
    func tabDockAction<Action: View>(
        tag: MainTab,
        layer: TabDockLayer = .root,
        isActive: Bool = true,
        @ViewBuilder _ action: @escaping () -> Action
    ) -> some View {
        modifier(
            TabDockActionModifier(tag: tag, layer: layer, isActive: isActive, action: action)
        )
    }
}
