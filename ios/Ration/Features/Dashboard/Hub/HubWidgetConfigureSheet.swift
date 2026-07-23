import SwiftUI

/// Per-widget Hub configuration — one density control plus secondary filters.
struct HubWidgetConfigureSheet: View {
    let widget: HubWidgetLayout
    let availableMealTags: [String]
    let availableCargoTags: [String]
    let onSave: (HubWidgetLayout) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var filters: HubWidgetFilters
    @State private var size: String

    init(
        widget: HubWidgetLayout,
        availableMealTags: [String],
        availableCargoTags: [String],
        onSave: @escaping (HubWidgetLayout) -> Void
    ) {
        self.widget = widget
        self.availableMealTags = availableMealTags
        self.availableCargoTags = availableCargoTags
        self.onSave = onSave
        let def = HubWidgetRegistry.definitions[HubWidgetID(rawValue: widget.id) ?? .hubStats]
        _filters = State(initialValue: widget.filters ?? HubWidgetFilters())
        _size = State(
            initialValue: HubLayoutEngine.resolvedSize(widget.size, defaultSize: def?.defaultSize ?? "md")
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                densitySection

                if supportsMealTags {
                    Section {
                        if availableMealTags.isEmpty {
                            Text("No meal tags yet").rationCaption()
                        } else {
                            TagMultiSelectPicker(
                                availableTags: availableMealTags,
                                selectedTags: mealTagsBinding,
                                maxSelection: Self.maxWidgetTagSelection,
                                showsTitle: false
                            )
                        }
                    } header: {
                        Text("Meal tags")
                    }
                }

                if widget.id == HubWidgetID.manifestPreview.rawValue {
                    Section("Slot") {
                        Picker("Slot", selection: slotBinding) {
                            Text("All").tag(Optional<String>.none)
                            ForEach(["breakfast", "lunch", "dinner", "snack"], id: \.self) { slot in
                                Text(slot.capitalized).tag(Optional(slot))
                            }
                        }
                    }
                }

                if widget.id == HubWidgetID.supplyPreview.rawValue {
                    Section {
                        if availableCargoTags.isEmpty {
                            Text("No cargo tags yet").rationCaption()
                        } else {
                            TagMultiSelectPicker(
                                availableTags: availableCargoTags,
                                selectedTags: supplyTagsBinding,
                                maxSelection: Self.maxWidgetTagSelection,
                                showsTitle: false
                            )
                        }
                    } header: {
                        Text("Cargo tags")
                    }
                }

                if widget.id == HubWidgetID.cargoExpiring.rawValue {
                    Section("Domain") {
                        Picker("Domain", selection: domainBinding) {
                            Text("All").tag(Optional<String>.none)
                            ForEach(["food", "household", "alcohol"], id: \.self) { domain in
                                Text(domain.capitalized).tag(Optional(domain))
                            }
                        }
                    }
                }
            }
            .navigationTitle(HubWidgetRegistry.definitions[HubWidgetID(rawValue: widget.id) ?? .hubStats]?.title ?? "Configure")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(builtWidget)
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder
    private var densitySection: some View {
        if widget.id == HubWidgetID.hubStats.rawValue {
            Section("Layout") {
                Picker("Density", selection: $size) {
                    Text("Compact").tag("sm")
                    Text("Standard").tag("md")
                    Text("Expanded").tag("lg")
                }
                .pickerStyle(.segmented)
            }
        } else if widget.id == HubWidgetID.manifestPreview.rawValue {
            Section("Days to show") {
                Picker("Day span", selection: daySpanBinding) {
                    Text("Today").tag(1)
                    Text("3 days").tag(3)
                    Text("7 days").tag(7)
                    Text("14 days").tag(14)
                }
                .pickerStyle(.segmented)
            }
        } else if supportsItemLimit {
            Section("Items to show") {
                Stepper(
                    "Show up to \(HubLayoutEngine.displayLimit(filters: filters, size: widget.size))",
                    value: limitBinding,
                    in: HubLayoutEngine.displayLimitRange
                )
            }
        }
    }

    private static let maxWidgetTagSelection = 5

    private var supportsMealTags: Bool {
        ["meals-ready", "meals-partial", "snacks-ready", "manifest-preview"].contains(widget.id)
    }

    private var supportsItemLimit: Bool {
        ["meals-ready", "meals-partial", "snacks-ready", "cargo-expiring", "supply-preview"].contains(widget.id)
    }

    private var builtWidget: HubWidgetLayout {
        var copy = widget
        let cleaned = cleanedFilters
        copy.filters = cleaned

        switch HubWidgetID(rawValue: widget.id) {
        case .hubStats:
            copy.size = size
        case .manifestPreview:
            let span = HubLayoutEngine.resolvedDaySpan(filters: cleaned)
            var filtersWithSpan = cleaned ?? HubWidgetFilters()
            filtersWithSpan.daySpan = span
            copy.filters = cleanedFilters(from: filtersWithSpan)
            copy.size = HubLayoutEngine.sizeForDaySpan(span)
        case .supplyPreview, .mealsReady, .mealsPartial, .snacksReady, .cargoExpiring:
            let limit = HubLayoutEngine.displayLimit(filters: cleaned, size: widget.size)
            var filtersWithLimit = cleaned ?? HubWidgetFilters()
            filtersWithLimit.limit = limit
            copy.filters = cleanedFilters(from: filtersWithLimit)
            copy.size = HubLayoutEngine.sizeForLimit(limit)
        case .none:
            break
        }
        return copy
    }

    private var cleanedFilters: HubWidgetFilters? {
        cleanedFilters(from: filters)
    }

    private func cleanedFilters(from source: HubWidgetFilters) -> HubWidgetFilters? {
        var copy = source
        if copy.tags?.isEmpty == true { copy.tags = nil }
        if copy.supplyTags?.isEmpty == true { copy.supplyTags = nil }
        let hasAny = copy.tags != nil || copy.slotType != nil || copy.domain != nil
            || copy.limit != nil || copy.daySpan != nil || copy.supplyTags != nil
        return hasAny ? copy : nil
    }

    private var mealTagsBinding: Binding<[String]> {
        Binding(
            get: { filters.tags ?? [] },
            set: { newValue in
                let capped = Array(newValue.prefix(Self.maxWidgetTagSelection))
                filters.tags = capped.isEmpty ? nil : capped
            }
        )
    }

    private var supplyTagsBinding: Binding<[String]> {
        Binding(
            get: { filters.supplyTags ?? [] },
            set: { newValue in
                let capped = Array(newValue.prefix(Self.maxWidgetTagSelection))
                filters.supplyTags = capped.isEmpty ? nil : capped
            }
        )
    }

    private var slotBinding: Binding<String?> {
        Binding(get: { filters.slotType }, set: { filters.slotType = $0 })
    }

    private var domainBinding: Binding<String?> {
        Binding(get: { filters.domain }, set: { filters.domain = $0 })
    }

    private var daySpanBinding: Binding<Int> {
        Binding(
            get: { filters.daySpan ?? 3 },
            set: { filters.daySpan = HubWidgetFilters.allowedDaySpans.contains($0) ? $0 : 3 }
        )
    }

    private var limitBinding: Binding<Int> {
        Binding(
            get: {
                HubLayoutEngine.displayLimit(filters: filters, size: widget.size)
            },
            set: { filters.limit = $0 }
        )
    }
}
