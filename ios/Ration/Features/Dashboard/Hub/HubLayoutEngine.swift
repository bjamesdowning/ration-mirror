import Foundation

/// Resolves visible Hub widgets from profile + custom layout — mirrors web `resolveLayout`.
enum HubLayoutEngine {
    /// All registered widgets ordered for editing — custom layout (or preset) with any
    /// missing widgets appended as hidden, so the editor always lists every widget.
    static func initEditableWidgets(profile: HubProfile?, layout: HubLayoutPayload?) -> [HubWidgetLayout] {
        let registered = Set(HubWidgetID.allCases.map(\.rawValue))
        var base: [HubWidgetLayout]

        if profile == "custom", let widgets = layout?.widgets, !widgets.isEmpty {
            base = widgets.filter { registered.contains($0.id) }
        } else {
            base = HubWidgetRegistry.preset(for: profile)
        }

        let included = Set(base.map(\.id))
        for id in HubWidgetID.allCases where !included.contains(id.rawValue) {
            base.append(HubWidgetLayout(
                id: id.rawValue,
                order: base.count,
                size: HubWidgetRegistry.definitions[id]?.defaultSize ?? "md",
                visible: false
            ))
        }

        return base.sorted { $0.order < $1.order }
    }

    /// Visible widgets in render order.
    static func resolveLayout(profile: HubProfile?, layout: HubLayoutPayload?) -> [HubWidgetLayout] {
        initEditableWidgets(profile: profile, layout: layout).filter(\.visible)
    }

    static func moveWidget(_ widgets: [HubWidgetLayout], id: String, direction: MoveDirection) -> [HubWidgetLayout] {
        guard let idx = widgets.firstIndex(where: { $0.id == id }) else { return widgets }
        let swapIdx = direction == .up ? idx - 1 : idx + 1
        guard swapIdx >= 0, swapIdx < widgets.count else { return widgets }
        var next = widgets
        next.swapAt(idx, swapIdx)
        return next.enumerated().map { index, widget in
            var copy = widget
            copy.order = index
            return copy
        }
    }

    static func toggleVisibility(_ widgets: [HubWidgetLayout], id: String) -> [HubWidgetLayout] {
        widgets.map { widget in
            guard widget.id == id else { return widget }
            var copy = widget
            copy.visible.toggle()
            return copy
        }
    }

    enum MoveDirection {
        case up, down
    }
}
