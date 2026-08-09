import SwiftUI

/// "Eat" — private plate-up sheet. Logs the caller's own serving after Cook;
/// never touches Cargo, other members' data, or shared plan state.
struct ManifestPlateUpSheet: View {
    let entry: ManifestEntry
    var hasIntakeConsent: Bool
    /// Returns an error message on failure, or `nil` on success.
    let onSave: (_ servings: Double, _ consent: Bool) async -> String?
    var onRemove: (() async -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var servings: Double
    @State private var hasConsent: Bool
    @State private var isSaving = false
    @State private var isRemoving = false
    @State private var errorMessage: String?

    init(
        entry: ManifestEntry,
        hasIntakeConsent: Bool,
        onSave: @escaping (_ servings: Double, _ consent: Bool) async -> String?,
        onRemove: (() async -> Void)? = nil
    ) {
        self.entry = entry
        self.hasIntakeConsent = hasIntakeConsent
        self.onSave = onSave
        self.onRemove = onRemove
        _servings = State(initialValue: entry.personalIntake?.servings ?? 1.0)
        _hasConsent = State(initialValue: hasIntakeConsent)
    }

    private var estimatedEnergyKcal: Double? {
        guard let perServing = entry.mealEnergyKcalPerServing else { return nil }
        return perServing * servings
    }

    private var estimatedProteinG: Double? {
        guard let perServing = entry.mealProteinGPerServing else { return nil }
        return perServing * servings
    }

    private var estimatedCarbsG: Double? {
        guard let perServing = entry.mealCarbsGPerServing else { return nil }
        return perServing * servings
    }

    private var estimatedFatG: Double? {
        guard let perServing = entry.mealFatGPerServing else { return nil }
        return perServing * servings
    }

    private var hasAnyNutritionEstimate: Bool {
        estimatedEnergyKcal != nil
            || estimatedProteinG != nil
            || estimatedCarbsG != nil
            || estimatedFatG != nil
    }

    private var servingsLabel: String {
        servings.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", servings)
            : String(format: "%.1f", servings)
    }

    private var canSave: Bool {
        !isSaving && !isRemoving && (hasIntakeConsent || hasConsent)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(entry.mealName.capitalized).rationHeadline()
                    Text(entry.mealType.capitalized).rationCaption()
                } header: {
                    Text("Log my serving")
                }

                Section {
                    Stepper(value: $servings, in: 0.5 ... 100, step: 0.5) {
                        HStack {
                            Text("Portion")
                            Spacer()
                            Text(servingsLabel)
                                .foregroundStyle(Theme.muted)
                        }
                    }
                    if hasAnyNutritionEstimate {
                        if let estimatedEnergyKcal {
                            LabeledContent(
                                "Calories",
                                value: "\(Int(estimatedEnergyKcal.rounded())) kcal"
                            )
                        }
                        if let estimatedProteinG {
                            LabeledContent(
                                "Protein",
                                value: formatGrams(estimatedProteinG)
                            )
                        }
                        if let estimatedCarbsG {
                            LabeledContent(
                                "Carbs",
                                value: formatGrams(estimatedCarbsG)
                            )
                        }
                        if let estimatedFatG {
                            LabeledContent(
                                "Fat",
                                value: formatGrams(estimatedFatG)
                            )
                        }
                    } else {
                        Text("Nutrition unavailable for this meal.")
                            .rationCaption()
                            .foregroundStyle(Theme.muted)
                    }
                } footer: {
                    if hasAnyNutritionEstimate {
                        Text("Estimates scale with portion. Saving logs these nutrients to your private intake.")
                    } else {
                        Text("This meal has no nutrition profile yet — open it in Galley after nutrition resolve, or skip logging calories.")
                    }
                }

                if !hasIntakeConsent {
                    Section {
                        Toggle("Allow personal serving logs", isOn: $hasConsent)
                            .tint(Theme.hyperGreen)
                    } footer: {
                        Text("Your logged servings are private — they're never shared with other household members.")
                    }
                }

                if let errorMessage {
                    Section {
                        ErrorBanner(message: errorMessage)
                    }
                }

                if entry.personalIntake != nil, let onRemove {
                    Section {
                        Button("Remove my log", role: .destructive) {
                            Task { await remove(onRemove) }
                        }
                        .disabled(isSaving || isRemoving)
                    }
                }
            }
            .navigationTitle("Eat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(!canSave)
                }
            }
        }
    }

    private func formatGrams(_ value: Double) -> String {
        if value.truncatingRemainder(dividingBy: 1) == 0 {
            return "\(Int(value)) g"
        }
        return String(format: "%.1f g", value)
    }

    @MainActor
    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        if let failure = await onSave(servings, hasConsent) {
            errorMessage = failure
        } else {
            Haptics.success()
            dismiss()
        }
    }

    @MainActor
    private func remove(_ action: () async -> Void) async {
        isRemoving = true
        errorMessage = nil
        defer { isRemoving = false }
        await action()
        dismiss()
    }
}
