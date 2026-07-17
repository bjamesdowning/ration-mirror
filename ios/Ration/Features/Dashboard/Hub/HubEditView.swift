import SwiftUI

/// Hub layout editor — native List reorder (EditMode + onMove), filters, size, visibility; autosaves.
struct HubEditView: View {
    let hubProfile: HubProfile?
    let hubLayout: HubLayoutPayload?
    let availableMealTags: [String]
    let availableCargoTags: [String]
    let onSave: ([HubWidgetLayout]) async throws -> Void
    let onSaveProfile: (HubProfile) async throws -> Void

    @State private var widgets: [HubWidgetLayout] = []
    @State private var selectedProfile: HubProfile = "full"
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var filterWidget: HubWidgetLayout?

    private let profileOptions: [HubProfile] = ["full", "cook", "shop", "minimal", "custom"]

    init(
        hubProfile: HubProfile?,
        hubLayout: HubLayoutPayload?,
        availableMealTags: [String],
        availableCargoTags: [String],
        onSave: @escaping ([HubWidgetLayout]) async throws -> Void,
        onSaveProfile: @escaping (HubProfile) async throws -> Void
    ) {
        self.hubProfile = hubProfile
        self.hubLayout = hubLayout
        self.availableMealTags = availableMealTags
        self.availableCargoTags = availableCargoTags
        self.onSave = onSave
        self.onSaveProfile = onSaveProfile
        _selectedProfile = State(initialValue: hubProfile ?? "full")
    }

    var body: some View {
        List {
            if let errorMessage {
                ErrorBanner(message: errorMessage)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            }

            Section("Layout profile") {
                Picker("Profile", selection: $selectedProfile) {
                    ForEach(profileOptions, id: \.self) { profile in
                        Text(profileLabel(profile)).tag(profile)
                    }
                }
                .pickerStyle(.menu)
                .disabled(isSaving)
                .onChange(of: selectedProfile) { _, newValue in
                    guard newValue != "custom" else { return }
                    applyPreset(newValue)
                }
            }

            Section("Widgets") {
                ForEach(widgets) { widget in
                    widgetRow(for: widget)
                        .moveDisabled(isSaving)
                }
                .onMove(perform: moveWidgets)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .environment(\.editMode, .constant(.active))
        .scrollDismissesKeyboard(.interactively)
        .overlay {
            if isSaving { ProgressView().tint(Theme.hyperGreen) }
        }
        .sheet(item: $filterWidget) { widget in
            HubWidgetFilterSheet(
                widget: widget,
                availableMealTags: availableMealTags,
                availableCargoTags: availableCargoTags
            ) { filters in
                widgets = widgets.map { row in
                    guard row.id == widget.id else { return row }
                    var copy = row
                    copy.filters = filters
                    return copy
                }
                persist()
            }
        }
        .onAppear {
            widgets = HubLayoutEngine.initEditableWidgets(profile: hubProfile, layout: hubLayout)
            selectedProfile = hubProfile ?? "full"
        }
    }

    @ViewBuilder
    private func widgetRow(for widget: HubWidgetLayout) -> some View {
        let def = HubWidgetRegistry.definitions[HubWidgetID(rawValue: widget.id) ?? .hubStats]
        let title = def?.title ?? widget.id
        let description = def?.description ?? ""
        let defaultSize = def?.defaultSize ?? "md"

        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).rationBody()
                    if !description.isEmpty {
                        Text(description).rationCaption()
                    }
                    if widget.filters != nil {
                        Text("Filters active").rationCaption().foregroundStyle(Theme.hyperGreen)
                    }
                }
                Spacer(minLength: 8)
                if supportsFilters(widget.id) {
                    Button {
                        filterWidget = widget
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                    }
                    .buttonStyle(.plain)
                    .disabled(isSaving)
                    .accessibilityLabel("Edit filters for \(title)")
                }
                Toggle("", isOn: binding(for: widget.id))
                    .labelsHidden()
                    .tint(Theme.hyperGreen)
                    .disabled(isSaving)
                    .accessibilityLabel(widget.visible ? "Hide \(title)" : "Show \(title)")
            }

            Picker("Size", selection: sizeBinding(for: widget.id, defaultSize: defaultSize)) {
                Text("S").tag("sm")
                Text("M").tag("md")
                Text("L").tag("lg")
            }
            .pickerStyle(.segmented)
            .disabled(isSaving)
        }
        .padding(.vertical, 4)
        .listRowBackground(Theme.surface)
        .opacity(widget.visible ? 1 : 0.55)
    }

    private func profileLabel(_ profile: HubProfile) -> String {
        switch profile {
        case "cook": return "Cook"
        case "shop": return "Shop"
        case "minimal": return "Minimal"
        case "custom": return "Custom"
        default: return "Full"
        }
    }

    private func applyPreset(_ profile: HubProfile) {
        widgets = HubLayoutEngine.initEditableWidgets(profile: profile, layout: nil)
        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                try await onSaveProfile(profile)
                Haptics.success()
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        }
    }

    private func supportsFilters(_ id: String) -> Bool {
        ["meals-ready", "meals-partial", "snacks-ready", "manifest-preview", "cargo-expiring", "supply-preview"].contains(id)
    }

    private func moveWidgets(from source: IndexSet, to destination: Int) {
        widgets.move(fromOffsets: source, toOffset: destination)
        widgets = HubLayoutEngine.reindexOrder(widgets)
        persist()
    }

    private func binding(for id: String) -> Binding<Bool> {
        Binding(
            get: { widgets.first(where: { $0.id == id })?.visible ?? false },
            set: { newValue in
                widgets = widgets.map { widget in
                    guard widget.id == id else { return widget }
                    var copy = widget
                    copy.visible = newValue
                    return copy
                }
                persist()
            }
        )
    }

    private func sizeBinding(for id: String, defaultSize: String) -> Binding<String> {
        Binding(
            get: {
                HubLayoutEngine.resolvedSize(
                    widgets.first(where: { $0.id == id })?.size,
                    defaultSize: defaultSize
                )
            },
            set: { newValue in
                widgets = widgets.map { widget in
                    guard widget.id == id else { return widget }
                    var copy = widget
                    copy.size = newValue
                    return copy
                }
                persist()
            }
        )
    }

    private func persist() {
        selectedProfile = "custom"
        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                try await onSave(widgets)
                Haptics.success()
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        }
    }
}
