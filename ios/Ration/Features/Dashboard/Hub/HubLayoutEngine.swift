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

    /// Reorders visible widgets by moving `sourceId` to the position of `destinationId`.
    static func reorderVisible(
        _ widgets: [HubWidgetLayout],
        moving sourceId: String,
        to destinationId: String
    ) -> [HubWidgetLayout] {
        let sorted = widgets.sorted { $0.order < $1.order }
        var visible = sorted.filter(\.visible)
        guard let fromIndex = visible.firstIndex(where: { $0.id == sourceId }),
              let toIndex = visible.firstIndex(where: { $0.id == destinationId }),
              fromIndex != toIndex
        else { return sorted }

        let moved = visible.remove(at: fromIndex)
        visible.insert(moved, at: toIndex)

        var visibleIterator = visible.makeIterator()
        return sorted.enumerated().map { index, widget in
            var copy = widget.visible ? (visibleIterator.next() ?? widget) : widget
            copy.order = index
            return copy
        }
    }

    /// Row display cap by widget size — mirrors web compact vs full layouts.
    static func rowLimit(for size: String?) -> Int {
        switch size ?? "md" {
        case "sm": return 2
        case "lg": return 6
        default: return 4
        }
    }

    static func resolvedSize(_ size: String?, defaultSize: String) -> String {
        let raw = size ?? defaultSize
        return ["sm", "md", "lg"].contains(raw) ? raw : defaultSize
    }
}
