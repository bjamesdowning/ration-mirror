import SwiftUI

struct PreferencesSettingsSection: View {
    @Environment(AppEnvironment.self) private var env
    let settings: UserSettings
    let api: RationAPI

    @State private var selectedAllergens: Set<String>
    @State private var expirationDays: Double
    @State private var isSaving = false

    init(settings: UserSettings, api: RationAPI) {
        self.settings = settings
        self.api = api
        _selectedAllergens = State(initialValue: Set(AllergenCatalog.parse(settings.allergens)))
        _expirationDays = State(initialValue: Double(settings.expirationAlertDays ?? 7))
    }

    var body: some View {
        Section("Dietary restrictions") {
            Text("Galley meals containing selected allergens are flagged on the list and meal detail.")
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
            ForEach(AllergenCatalog.options) { option in
                Toggle(option.label, isOn: Binding(
                    get: { selectedAllergens.contains(option.id) },
                    set: { enabled in
                        if enabled {
                            selectedAllergens.insert(option.id)
                        } else {
                            selectedAllergens.remove(option.id)
                        }
                        Task { await saveAllergens() }
                    }
                ))
            }
        }

        Section("Expiration alerts") {
            Text("Cargo expiring within this window appears on your Hub.")
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
            HStack {
                Slider(value: $expirationDays, in: 1...30, step: 1) { editing in
                    if !editing {
                        Task { await saveExpirationDays() }
                    }
                }
                Text("\(Int(expirationDays)) days")
                    .font(Typography.mono(14))
                    .foregroundStyle(Theme.carbon)
                    .frame(minWidth: 64, alignment: .trailing)
            }
            if isSaving {
                Text("Saving…")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    @MainActor
    private func saveAllergens() async {
        isSaving = true
        defer { isSaving = false }
        let sorted = selectedAllergens.sorted()
        do {
            let response = try await api.patchSettings(SettingsPatch(allergens: sorted))
            env.launch.updateUserSettings(response.settings)
        } catch {
            // Revert optimistic toggle to last known server settings.
            selectedAllergens = Set(AllergenCatalog.parse(env.launch.userSettings?.allergens))
        }
    }

    @MainActor
    private func saveExpirationDays() async {
        isSaving = true
        defer { isSaving = false }
        do {
            let response = try await api.patchSettings(
                SettingsPatch(expirationAlertDays: Int(expirationDays))
            )
            env.launch.updateUserSettings(response.settings)
        } catch {
            // Revert optimistic slider to last known server settings.
            expirationDays = Double(env.launch.userSettings?.expirationAlertDays ?? 7)
        }
    }
}
