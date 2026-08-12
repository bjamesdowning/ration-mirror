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
    @Environment(\.openURL) private var openURL
    @State private var servings: Double
    @State private var notes: String
    @State private var hasConsent: Bool
    @State private var consentStatus: NutritionConsentStatus?
    @State private var isSaving = false
    @State private var isRemoving = false
    @State private var errorMessage: String?

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
        _hasConsent = State(initialValue: hasIntakeConsent)
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
        !isSaving
            && !isRemoving
            && (hasIntakeConsent || consentStatus?.state == .active || hasConsent)
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

                if !hasIntakeConsent {
                    Section {
                        if let consentStatus {
                            Text(consentStatus.statement.text)
                                .font(Typography.caption())
                            if consentStatus.state != .active {
                                Toggle(
                                    "I have read this statement and explicitly consent",
                                    isOn: $hasConsent
                                )
                                .tint(Theme.hyperGreen)
                            }
                            Button("Privacy Policy") {
                                openURL(AppConfig.privacyURL)
                            }
                        } else {
                            ProgressView("Loading privacy statement…")
                                .tint(Theme.hyperGreen)
                        }
                    } footer: {
                        Text("Your logged servings are private. Withdrawal and erasure are available in Privacy & AI settings.")
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
        }
        .task {
            guard !hasIntakeConsent else { return }
            do {
                consentStatus = try await env.api.nutritionPrivacy().consents.first {
                    $0.purpose == .intake
                }
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        }
    }

    @MainActor
    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            if !hasIntakeConsent && consentStatus?.state != .active {
                guard hasConsent, let consentStatus else {
                    errorMessage = "Review and accept the current intake consent statement."
                    return
                }
                let response = try await env.api.grantNutritionConsent(consentStatus)
                guard response.consents.contains(where: {
                    $0.purpose == .intake && $0.state == .active
                }) else {
                    errorMessage = "Consent could not be recorded. Try again."
                    return
                }
            }
            let notePayload = notesEnabled ? IntakeNotesField.payload(from: notes) : nil
            if let failure = await onSave(servings, notePayload) {
                errorMessage = failure
            } else {
                Haptics.success()
                dismiss()
            }
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
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
