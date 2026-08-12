import SwiftUI

/// "Eat" — private plate-up sheet. Logs the caller's own serving after Cook;
/// never touches Cargo, other members' data, or shared plan state.
struct ManifestPlateUpSheet: View {
    let entry: ManifestEntry
    var hasIntakeConsent: Bool
    /// Returns an error message on failure, or `nil` on success.
    let onSave: (_ servings: Double, _ notes: String?) async -> String?
    var onRemove: (() async -> Void)?

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var servings: Double
    @State private var notes: String
    @State private var isSaving = false
    @State private var isRemoving = false
    @State private var errorMessage: String?
    @State private var showingFeatureEnablement = false

    init(
        entry: ManifestEntry,
        hasIntakeConsent: Bool,
        onSave: @escaping (_ servings: Double, _ notes: String?) async -> String?,
        onRemove: (() async -> Void)? = nil
    ) {
        self.entry = entry
        self.hasIntakeConsent = hasIntakeConsent
        self.onSave = onSave
        self.onRemove = onRemove
        _servings = State(initialValue: entry.personalIntake?.servings ?? 1.0)
        _notes = State(initialValue: entry.personalIntake?.notes ?? "")
    }

    private var notesEnabled: Bool { env.session.clientFlags.isNutritionIntakeNotesEnabled }

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
        !isSaving && !isRemoving && hasIntakeConsent
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(entry.mealName.capitalized).rationHeadline()
                    Text(entry.mealType.capitalized).rationCaption()
                    Text("Not medical advice. Goals and totals are planning aids only.")
                        .rationCaption()
                } header: {
                    Text("Log my serving")
                }

                if !hasIntakeConsent {
                    Section {
                        Text("Macro Tracking is off — enable it in Settings to log meals.")
                            .font(Typography.caption())
                            .foregroundStyle(Theme.muted)
                        Button("Open Feature enablement") {
                            showingFeatureEnablement = true
                        }
                        .foregroundStyle(Theme.hyperGreen)
                    }
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
                        IntakeMacroPreview(
                            energyKcal: estimatedEnergyKcal,
                            proteinG: estimatedProteinG,
                            carbsG: estimatedCarbsG,
                            fatG: estimatedFatG
                        )
                    } else {
                        IntakeMacroPreview(
                            energyKcal: nil,
                            proteinG: nil,
                            carbsG: nil,
                            fatG: nil,
                            unavailableMessage: "Nutrition unavailable for this meal."
                        )
                    }
                } footer: {
                    if hasAnyNutritionEstimate {
                        Text("Estimates scale with portion. Saving logs these nutrients to your private intake.")
                    } else {
                        Text("This meal has no nutrition profile yet — open it in Galley after nutrition resolve, or skip logging calories.")
                    }
                }

                if notesEnabled {
                    Section {
                        IntakeNotesField(notes: $notes)
                    } header: {
                        Text("Notes")
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
                        .accessibilityIdentifier("manifest.eat.save")
                }
            }
            .sheet(isPresented: $showingFeatureEnablement) {
                PrivacySettingsView()
            }
        }
    }

    @MainActor
    private func save() async {
        guard hasIntakeConsent else {
            errorMessage = "Macro Tracking is off — enable it in Settings to log meals."
            return
        }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        let notePayload = notesEnabled ? IntakeNotesField.payload(from: notes) : nil
        if let failure = await onSave(servings, notePayload) {
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
