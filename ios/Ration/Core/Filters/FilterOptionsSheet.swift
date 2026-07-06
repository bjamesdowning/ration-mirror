import SwiftUI

/// Bottom sheet for domain, tag, galley match, and supply sort controls.
struct FilterOptionsSheet: View {
    @Bindable var filters: PageFilterState
    var availableTags: [String] = []
    var onApplySupplyUnitMode: ((String) -> Void)?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if filters.configuration.supportsDomain {
                        domainSection
                    }
                    if filters.configuration.supportsTags, !availableTags.isEmpty {
                        tagSection
                    }
                    if filters.configuration.supportsMatching {
                        matchSection
                    }
                    if filters.configuration.supportsSupplySort {
                        supplySortSection
                    }
                    if filters.configuration.supportsSupplyUnitMode {
                        supplyUnitSection
                    }
                }
                .padding(16)
            }
            .background(Theme.ceramic)
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if filters.hasActiveFilters {
                        Button("Clear all") {
                            filters.clearAll()
                            Haptics.light()
                        }
                        .foregroundStyle(Theme.hyperGreen)
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var domainSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Domain").rationHeadline()
            FlowLayout(spacing: 8) {
                FilterChip(label: "All", isActive: filters.domain == nil) {
                    filters.domain = nil
                }
                ForEach(CargoDomain.allCases, id: \.self) { domain in
                    FilterChip(label: domain.label, isActive: filters.domain == domain) {
                        filters.domain = filters.domain == domain ? nil : domain
                    }
                }
            }
        }
    }

    private var tagSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Tags").rationHeadline()
            FlowLayout(spacing: 8) {
                FilterChip(label: "All", isActive: filters.selectedTags.isEmpty) {
                    filters.selectedTags = []
                }
                ForEach(availableTags, id: \.self) { tag in
                    FilterChip(
                        label: Tag.displayName(from: tag),
                        isActive: filters.selectedTags.contains(tag)
                    ) {
                        filters.toggleTag(tag)
                    }
                }
            }
        }
    }

    private var matchSection: some View {
        GlassCard {
            Toggle(isOn: $filters.matchingEnabled) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Cargo match mode").rationBody()
                    Text("Show meals you can make with current Cargo").rationCaption()
                }
            }
            .tint(Theme.hyperGreen)
        }
    }

    private var supplySortSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Sort").rationHeadline()
            FlowLayout(spacing: 8) {
                ForEach(SupplySortMode.allCases, id: \.self) { mode in
                    FilterChip(label: mode.label, isActive: filters.supplySort == mode) {
                        filters.supplySort = mode
                    }
                }
            }
            Toggle(isOn: $filters.hidePurchased) {
                Text("Hide purchased").rationBody()
            }
            .tint(Theme.hyperGreen)
        }
    }

    private var supplyUnitSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Unit display").rationHeadline()
            FlowLayout(spacing: 8) {
                ForEach(UnitDisplayMode.allCases) { mode in
                    FilterChip(label: mode.label, isActive: filters.supplyUnitMode == mode.rawValue) {
                        filters.supplyUnitMode = mode.rawValue
                        onApplySupplyUnitMode?(mode.rawValue)
                    }
                }
            }
        }
    }
}

/// Simple horizontal flow layout for filter chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = computeRows(proposal: proposal, subviews: subviews)
        let height = rows.reduce(0) { $0 + $1.height + spacing } - spacing
        return CGSize(width: proposal.width ?? 0, height: max(height, 0))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in computeRows(proposal: proposal, subviews: subviews) {
            var x = bounds.minX
            for item in row.items {
                item.subview.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
                x += item.size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct RowItem {
        let subview: LayoutSubviews.Element
        let size: CGSize
    }

    private struct Row {
        var items: [RowItem]
        var height: CGFloat
    }

    private func computeRows(proposal: ProposedViewSize, subviews: Subviews) -> [Row] {
        let maxWidth = proposal.width ?? .infinity
        var rows: [Row] = []
        var current = Row(items: [], height: 0)
        var x: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, !current.items.isEmpty {
                rows.append(current)
                current = Row(items: [], height: 0)
                x = 0
            }
            current.items.append(RowItem(subview: subview, size: size))
            current.height = max(current.height, size.height)
            x += size.width + spacing
        }
        if !current.items.isEmpty { rows.append(current) }
        return rows
    }
}
