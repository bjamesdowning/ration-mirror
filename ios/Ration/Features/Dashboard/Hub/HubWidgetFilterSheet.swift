import SwiftUI

struct HubWidgetFilterSheet: View {
    let widget: HubWidgetLayout
    let availableMealTags: [String]
    let availableCargoTags: [String]
    let onSave: (HubWidgetFilters?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var filters: HubWidgetFilters

    init(
        widget: HubWidgetLayout,
        availableMealTags: [String],
        availableCargoTags: [String],
        onSave: @escaping (HubWidgetFilters?) -> Void
    ) {
        self.widget = widget
        self.availableMealTags = availableMealTags
        self.availableCargoTags = availableCargoTags
        self.onSave = onSave
        _filters = State(initialValue: widget.filters ?? HubWidgetFilters())
    }

    var body: some View {
        NavigationStack {
            Form {
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
                    Section("Days to show") {
                        Picker("Day span", selection: daySpanBinding) {
                            Text("Today").tag(1)
                            Text("3 days").tag(3)
                            Text("7 days").tag(7)
                            Text("14 days").tag(14)
                        }
                        .pickerStyle(.segmented)
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
                    Section("Item limit") {
                        Stepper("Show up to \(filters.limit ?? 6)", value: limitBinding, in: 1...20)
                    }
                }

                if supportsLimit && widget.id != HubWidgetID.supplyPreview.rawValue {
                    Section("Item limit") {
                        Stepper("Show up to \(filters.limit ?? 6)", value: limitBinding, in: 1...20)
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
            .navigationTitle(HubWidgetRegistry.definitions[HubWidgetID(rawValue: widget.id) ?? .hubStats]?.title ?? "Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(cleanedFilters)
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private static let maxWidgetTagSelection = 5

    private var supportsMealTags: Bool {
        ["meals-ready", "meals-partial", "snacks-ready", "manifest-preview"].contains(widget.id)
    }

    private var supportsLimit: Bool {
        ["meals-ready", "meals-partial", "snacks-ready", "cargo-expiring"].contains(widget.id)
    }

    private var cleanedFilters: HubWidgetFilters? {
        var copy = filters
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
            get: { filters.daySpan ?? 7 },
            // Keep in sync with HubWidgetFiltersSchema (1 | 3 | 7 | 14); ignore
            // any value outside the allowed set to stay contract-aligned.
            set: { filters.daySpan = HubWidgetFilters.allowedDaySpans.contains($0) ? $0 : 7 }
        )
    }

    private var limitBinding: Binding<Int> {
        Binding(get: { filters.limit ?? 6 }, set: { filters.limit = $0 })
    }
}
