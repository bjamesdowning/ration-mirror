import SwiftUI

/// List-based hub layout editor — mirrors web `HubEditModeMobile`.
struct HubEditView: View {
    let hubProfile: HubProfile?
    let hubLayout: HubLayoutPayload?
    let onSave: ([HubWidgetLayout]) async throws -> Void
    let onExit: () -> Void

    @State private var widgets: [HubWidgetLayout] = []
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                if let errorMessage {
                    ErrorBanner(message: errorMessage).listRowBackground(Color.clear)
                }
                ForEach(widgets) { widget in
                    if let def = HubWidgetRegistry.definitions[HubWidgetID(rawValue: widget.id) ?? .hubStats] {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(def.title).rationBody()
                                Text(def.description).rationCaption()
                            }
                            Spacer()
                            Toggle("", isOn: binding(for: widget.id))
                                .labelsHidden()
                                .tint(Theme.hyperGreen)
                        }
                        .swipeActions {
                            Button {
                                widgets = HubLayoutEngine.moveWidget(widgets, id: widget.id, direction: .up)
                                persist()
                            } label: { Label("Up", systemImage: "arrow.up") }
                            Button {
                                widgets = HubLayoutEngine.moveWidget(widgets, id: widget.id, direction: .down)
                                persist()
                            } label: { Label("Down", systemImage: "arrow.down") }
                        }
                        .listRowBackground(Theme.surface)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.ceramic)
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
        }
        .onAppear {
            widgets = HubLayoutEngine.initEditableWidgets(profile: hubProfile, layout: hubLayout)
        }
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
