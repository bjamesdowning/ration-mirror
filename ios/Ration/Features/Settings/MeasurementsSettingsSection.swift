import SwiftUI

struct MeasurementsSettingsSection: View {
    @Environment(AppEnvironment.self) private var env
    let settings: UserSettings

    @State private var selectedMode: UnitDisplayMode
    @State private var isSaving = false

    init(settings: UserSettings) {
        self.settings = settings
        _selectedMode = State(initialValue: UnitDisplayMode.resolve(from: settings))
    }

    var body: some View {
        Section("Measurements") {
            Picker("Unit display", selection: $selectedMode) {
                ForEach(UnitDisplayMode.allCases) { mode in
                    Text(mode.label).tag(mode)
                }
            }
            .pickerStyle(.menu)
            .onChange(of: selectedMode) { _, newMode in
                env.unitDisplayMode.apply(newMode)
                Task { await save(newMode) }
            }
            if isSaving {
                Text("Saving…")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
            }
            Text("Original shows stored units. Metric and Imperial use shopping weights. Cooking uses cups and spoons when density is known.")
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
        }
    }

    @MainActor
    private func save(_ mode: UnitDisplayMode) async {
        isSaving = true
        defer { isSaving = false }
        _ = try? await env.api.patchSettings(env.unitDisplayMode.settingsPatch(for: mode))
    }
}
