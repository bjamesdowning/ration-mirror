import SwiftUI

/// Hub layout editor — reorder, visibility, and per-widget Configure sheet; autosaves.
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
    @State private var configureWidget: HubWidgetLayout?

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
        .sheet(item: $configureWidget) { widget in
            HubWidgetConfigureSheet(
                widget: widget,
                availableMealTags: availableMealTags,
                availableCargoTags: availableCargoTags
            ) { updated in
                widgets = widgets.map { row in
                    row.id == updated.id ? updated : row
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
        let summary = HubLayoutEngine.densitySummary(for: widget)

        HStack(alignment: .top, spacing: 8) {
            Button {
                configureWidget = widget
            } label: {
                HStack(alignment: .top, spacing: 8) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title).rationBody().foregroundStyle(Theme.carbon)
                        if !description.isEmpty {
                            Text(description).rationCaption()
                        }
                        if !summary.isEmpty {
                            Text(summary)
                                .rationCaption()
                                .foregroundStyle(Theme.hyperGreen)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                        .padding(.top, 4)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(isSaving)
            .accessibilityLabel("Configure \(title)")

            Toggle("", isOn: binding(for: widget.id))
                .labelsHidden()
                .tint(Theme.hyperGreen)
                .disabled(isSaving)
                .accessibilityLabel(widget.visible ? "Hide \(title)" : "Show \(title)")
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
