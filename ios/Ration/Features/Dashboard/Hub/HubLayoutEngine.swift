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
        return reindexOrder(next)
    }

    /// Assigns contiguous `order` values from array position (0…n-1).
    static func reindexOrder(_ widgets: [HubWidgetLayout]) -> [HubWidgetLayout] {
        widgets.enumerated().map { index, widget in
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

    /// Allowed item-count range for list widgets (Supply, meals, expiring).
    static let displayLimitRange = 2...12
    static let defaultDisplayLimit = 6

    /// How many rows a list widget shows.
    /// Prefers `filters.limit`; when unset, derives from legacy `size` (sm/md/lg → 2/4/6).
    static func displayLimit(
        filters: HubWidgetFilters?,
        size: String? = nil,
        defaultLimit: Int = defaultDisplayLimit
    ) -> Int {
        if let limit = filters?.limit {
            return min(max(limit, displayLimitRange.lowerBound), displayLimitRange.upperBound)
        }
        if let size {
            switch resolvedSize(size, defaultSize: "md") {
            case "sm": return 2
            case "lg": return 6
            default: return 4
            }
        }
        return min(max(defaultLimit, displayLimitRange.lowerBound), displayLimitRange.upperBound)
    }

    /// Maps item count → size for web grid parity (`≤2→sm`, `≤4→md`, else `lg`).
    static func sizeForLimit(_ limit: Int) -> String {
        if limit <= 2 { return "sm" }
        if limit <= 4 { return "md" }
        return "lg"
    }

    /// Maps Manifest day span → size for web grid parity.
    static func sizeForDaySpan(_ daySpan: Int) -> String {
        switch daySpan {
        case 1: return "sm"
        case 3: return "md"
        default: return "lg"
        }
    }

    /// Normalized day span from filters (allowed: 1, 3, 7, 14).
    static func resolvedDaySpan(filters: HubWidgetFilters?, defaultSpan: Int = 3) -> Int {
        let raw = filters?.daySpan ?? defaultSpan
        return HubWidgetFilters.allowedDaySpans.contains(raw) ? raw : defaultSpan
    }

    static func resolvedSize(_ size: String?, defaultSize: String) -> String {
        let raw = size ?? defaultSize
        return ["sm", "md", "lg"].contains(raw) ? raw : defaultSize
    }

    /// Human-readable density summary for Edit Hub rows.
    static func densitySummary(for widget: HubWidgetLayout) -> String {
        let id = HubWidgetID(rawValue: widget.id)
        switch id {
        case .hubStats:
            switch resolvedSize(widget.size, defaultSize: "lg") {
            case "sm": return "Compact layout"
            case "lg": return "Expanded layout"
            default: return "Standard layout"
            }
        case .manifestPreview:
            let span = resolvedDaySpan(filters: widget.filters)
            var parts: [String] = []
            switch span {
            case 1: parts.append("Today")
            case 3: parts.append("3 days")
            case 7: parts.append("7 days")
            case 14: parts.append("14 days")
            default: parts.append("\(span) days")
            }
            if let slot = widget.filters?.slotType, !slot.isEmpty {
                parts.append(slot.capitalized)
            }
            if let tags = widget.filters?.tags, !tags.isEmpty {
                parts.append("Tags")
            }
            return parts.joined(separator: " · ")
        case .supplyPreview, .mealsReady, .mealsPartial, .snacksReady, .cargoExpiring:
            let limit = displayLimit(filters: widget.filters, size: widget.size)
            var parts = ["Show \(limit)"]
            if id == .cargoExpiring, let domain = widget.filters?.domain, !domain.isEmpty {
                parts.append(domain.capitalized)
            } else if hasTagFilters(widget) {
                parts.append("Tags")
            }
            return parts.joined(separator: " · ")
        case .none:
            return ""
        }
    }

    private static func hasTagFilters(_ widget: HubWidgetLayout) -> Bool {
        let f = widget.filters
        switch HubWidgetID(rawValue: widget.id) {
        case .supplyPreview:
            return !(f?.supplyTags ?? []).isEmpty
        case .mealsReady, .mealsPartial, .snacksReady, .manifestPreview:
            return !(f?.tags ?? []).isEmpty
        default:
            return false
        }
    }
}
