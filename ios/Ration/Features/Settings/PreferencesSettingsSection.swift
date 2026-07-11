import SwiftUI

private struct AllergenOption: Identifiable {
    let id: String
    let label: String
}

private let allergenOptions: [AllergenOption] = [
    AllergenOption(id: "milk", label: "Milk / Dairy"),
    AllergenOption(id: "eggs", label: "Eggs"),
    AllergenOption(id: "fish", label: "Fish"),
    AllergenOption(id: "shellfish", label: "Shellfish"),
    AllergenOption(id: "tree-nuts", label: "Tree Nuts"),
    AllergenOption(id: "peanuts", label: "Peanuts"),
    AllergenOption(id: "wheat", label: "Wheat / Gluten"),
    AllergenOption(id: "soybeans", label: "Soybeans"),
    AllergenOption(id: "sesame", label: "Sesame"),
    AllergenOption(id: "mustard", label: "Mustard"),
    AllergenOption(id: "celery", label: "Celery"),
    AllergenOption(id: "lupin", label: "Lupin"),
    AllergenOption(id: "molluscs", label: "Molluscs"),
    AllergenOption(id: "sulphites", label: "Sulphites"),
]

struct PreferencesSettingsSection: View {
    let settings: UserSettings
    let api: RationAPI

    @State private var selectedAllergens: Set<String>
    @State private var expirationDays: Double
    @State private var isSaving = false

    init(settings: UserSettings, api: RationAPI) {
        self.settings = settings
        self.api = api
        _selectedAllergens = State(initialValue: Set(settings.allergens ?? []))
        _expirationDays = State(initialValue: Double(settings.expirationAlertDays ?? 7))
    }

    var body: some View {
        Section("Dietary restrictions") {
            Text("Meals containing selected allergens are flagged throughout the app.")
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
            ForEach(allergenOptions) { option in
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
        _ = try? await api.patchSettings(SettingsPatch(allergens: sorted))
    }

    @MainActor
    private func saveExpirationDays() async {
        isSaving = true
        defer { isSaving = false }
        _ = try? await api.patchSettings(
            SettingsPatch(expirationAlertDays: Int(expirationDays))
        )
    }
}
