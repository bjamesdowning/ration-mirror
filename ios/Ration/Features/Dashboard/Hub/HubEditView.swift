import SwiftUI

/// Hub layout editor — long-press drag reorder, filters, size, visibility; autosaves like web `HubEditModeMobile`.
struct HubEditView: View {
    let hubProfile: HubProfile?
    let hubLayout: HubLayoutPayload?
    let availableMealTags: [String]
    let availableCargoTags: [String]
    var isTabActive: Bool = true
    let onSave: ([HubWidgetLayout]) async throws -> Void
    let onSaveProfile: (HubProfile) async throws -> Void
    let onExit: () -> Void

    @State private var widgets: [HubWidgetLayout] = []
    @State private var reorderSession = HubWidgetReorderSession()
    @State private var selectedProfile: HubProfile = "full"
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var filterWidget: HubWidgetLayout?

    private let profileOptions: [HubProfile] = ["full", "cook", "shop", "minimal", "custom"]

    private var controlsDisabled: Bool {
        reorderSession.isDragging || isSaving
    }

    init(
        hubProfile: HubProfile?,
        hubLayout: HubLayoutPayload?,
        availableMealTags: [String],
        availableCargoTags: [String],
        isTabActive: Bool = true,
        onSave: @escaping ([HubWidgetLayout]) async throws -> Void,
        onSaveProfile: @escaping (HubProfile) async throws -> Void,
        onExit: @escaping () -> Void
    ) {
        self.hubProfile = hubProfile
        self.hubLayout = hubLayout
        self.availableMealTags = availableMealTags
        self.availableCargoTags = availableCargoTags
        self.isTabActive = isTabActive
        self.onSave = onSave
        self.onSaveProfile = onSaveProfile
        self.onExit = onExit
        _selectedProfile = State(initialValue: hubProfile ?? "full")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let errorMessage {
                        ErrorBanner(message: errorMessage)
                    }

                    profileSection

                    Text("Widgets")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                        .padding(.horizontal, 4)

                    ForEach(Array(reorderSession.displayOrder.enumerated()), id: \.element.id) { index, widget in
                        if let def = HubWidgetRegistry.definitions[HubWidgetID(rawValue: widget.id) ?? .hubStats] {
                            widgetRow(widget: widget, def: def, index: index)
                                .hubWidgetReorderRow(
                                    id: widget.id,
                                    session: reorderSession,
                                    onOrderChanged: applyReorderFromSession
                                )
                        }
                    }
                }
                .padding(16)
                .copilotDockContentPadding()
            }
            .coordinateSpace(name: HubWidgetReorder.coordinateSpaceName)
            .onPreferenceChange(HubWidgetFramePreferenceKey.self) { frames in
                reorderSession.widgetFrames = frames
            }
            .background(Theme.ceramic)
            .scrollDismissesKeyboard(.interactively)
            .copilotDockScrollMargins(hasTabAction: false)
            .copilotScrollTracked(tab: 0, isActive: isTabActive)
            .navigationTitle("Edit Hub")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { onExit() }
                }
            }
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
        }
        .onAppear {
            widgets = HubLayoutEngine.initEditableWidgets(profile: hubProfile, layout: hubLayout)
            selectedProfile = hubProfile ?? "full"
            reorderSession.syncDisplayOrder(from: widgets)
        }
        .onChange(of: widgets) { _, newValue in
            reorderSession.syncDisplayOrder(from: newValue)
        }
    }

    private var profileSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Layout profile")
                .rationCaption()
                .foregroundStyle(Theme.muted)
            Picker("Profile", selection: $selectedProfile) {
                ForEach(profileOptions, id: \.self) { profile in
                    Text(profileLabel(profile)).tag(profile)
                }
            }
            .pickerStyle(.menu)
            .disabled(controlsDisabled)
            .onChange(of: selectedProfile) { _, newValue in
                guard newValue != "custom" else { return }
                applyPreset(newValue)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    @ViewBuilder
    private func widgetRow(widget: HubWidgetLayout, def: HubWidgetDefinition, index: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                VStack(spacing: 4) {
                    Button {
                        moveWidget(id: widget.id, direction: .up)
                    } label: {
                        Image(systemName: "chevron.up")
                            .font(.caption.weight(.semibold))
                    }
                    .disabled(controlsDisabled || index <= 0)
                    .accessibilityLabel("Move \(def.title) up")

                    Button {
                        moveWidget(id: widget.id, direction: .down)
                    } label: {
                        Image(systemName: "chevron.down")
                            .font(.caption.weight(.semibold))
                    }
                    .disabled(controlsDisabled || index >= reorderSession.displayOrder.count - 1)
                    .accessibilityLabel("Move \(def.title) down")
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.muted)

                VStack(alignment: .leading, spacing: 4) {
                    Text(def.title).rationBody()
                    Text(def.description).rationCaption()
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
                    .disabled(controlsDisabled)
                    .accessibilityLabel("Edit filters for \(def.title)")
                }
                Toggle("", isOn: binding(for: widget.id))
                    .labelsHidden()
                    .tint(Theme.hyperGreen)
                    .disabled(controlsDisabled)
                    .accessibilityLabel(widget.visible ? "Hide \(def.title)" : "Show \(def.title)")
            }

            Picker("Size", selection: sizeBinding(for: widget.id, defaultSize: def.defaultSize)) {
                Text("S").tag("sm")
                Text("M").tag("md")
                Text("L").tag("lg")
            }
            .pickerStyle(.segmented)
            .disabled(controlsDisabled)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
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

    private func moveWidget(id: String, direction: HubLayoutEngine.MoveDirection) {
        widgets = HubLayoutEngine.moveWidget(widgets, id: id, direction: direction)
        persist()
    }

    private func applyReorderFromSession() {
        widgets = HubLayoutEngine.reindexOrder(reorderSession.displayOrder)
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
