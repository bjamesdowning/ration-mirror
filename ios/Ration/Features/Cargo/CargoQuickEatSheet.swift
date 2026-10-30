import SwiftUI

/// Single-sheet Cargo Quick Eat: choose amount → confirm → done.
struct CargoQuickEatSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppEnvironment.self) private var env
    let item: CargoItem
    var onConfirm: (_ quantity: Double, _ notes: String?) async -> CargoQuickEatResponse?
    var onFinished: (CargoQuickEatResponse) -> Void = { _ in }

    @State private var quantity: Double = 1
    @State private var gramsPerUnit: Double = CountUnitMass.referenceGrams
    @State private var massUnit: String = "g"
    @State private var didPrepare = false
    @State private var notes: String = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var stockEmpty: Bool { item.quantity <= 0 }
    private var remaining: Double { max(0, item.quantity - quantity) }
    private var notesEnabled: Bool { env.session.clientFlags.isNutritionIntakeNotesEnabled }

    var body: some View {
        NavigationStack {
            Form {
                Section(item.name.capitalized) {
                    QuantityStepperField(
                        value: $quantity,
                        unit: item.unit,
                        range: 0.01...1_000,
                        step: step
                    )
                    if needsMassLink {
                        massLinkControls
                    }
                    if stockEmpty {
                        Text("Pantry empty — snack will still appear on Manifest")
                            .rationCaption()
                            .foregroundStyle(Theme.muted)
                    } else if quantity > item.quantity {
                        Text("Only \(item.quantity.formatted()) \(item.unit) in pantry — extras won’t deduct")
                            .rationCaption()
                            .foregroundStyle(Theme.warning)
                    } else {
                        Text("Remaining after: \(remaining.formatted()) \(item.unit)")
                            .rationCaption()
                            .foregroundStyle(Theme.muted)
                    }
                }
                Section {
                    IntakeMacroPreview(
                        energyKcal: macroEstimate.energyKcal,
                        proteinG: macroEstimate.proteinG,
                        carbsG: macroEstimate.carbsG,
                        fatG: macroEstimate.fatG,
                        unavailableMessage: "Nutrition unavailable for this item."
                    )
                } footer: {
                    Text(needsMassLink
                        ? "Each \(item.unit) uses the weight you set. Macros follow USDA per 100 g for that weight. Not medical advice."
                        : "Estimates scale with amount. Saving logs nutrients to your private intake when available. Not medical advice. Goals and totals are planning aids only.")
                        .rationCaption()
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
                        Text(errorMessage)
                            .foregroundStyle(Theme.danger)
                            .rationCaption()
                    }
                }
                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        if isSaving {
                            ProgressView()
                        } else {
                            Text("Eat")
                        }
                    }
                    .disabled(isSaving || quantity <= 0)
                }
            }
            .navigationTitle("Eat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Eat") { Task { await submit() } }
                        .disabled(isSaving || quantity <= 0)
                }
            }
            .rationFormKeyboardToolbar()
        }
        .presentationDetents([.medium, .large])
        .onAppear { prepareIfNeeded() }
    }

    private var needsMassLink: Bool {
        CountUnitMass.needsMassLink(nutrition: item.nutrition, unit: item.unit)
    }

    private var massAmount: Binding<Double> {
        Binding(
            get: { CountUnitMass.display(grams: gramsPerUnit, unit: massUnit) },
            set: { gramsPerUnit = CountUnitMass.grams(from: $0, unit: massUnit) }
        )
    }

    private var massRange: ClosedRange<Double> {
        let lower = CountUnitMass.display(grams: 1, unit: massUnit)
        let upper = CountUnitMass.display(grams: 5_000, unit: massUnit)
        return lower...max(lower, upper)
    }

    @ViewBuilder
    private var massLinkControls: some View {
        Text("Each \(item.unit) weighs")
            .rationCaption()
            .foregroundStyle(Theme.muted)
        QuantityStepperField(
            value: massAmount,
            unit: massUnit,
            title: "Weight",
            range: massRange,
            step: QuantityEntry.step(for: massUnit)
        )
        Picker("Measure", selection: $massUnit) {
            ForEach(CountUnitMass.massUnits, id: \.self) { unit in
                Text(unit).tag(unit)
            }
        }
        .pickerStyle(.segmented)
        .accessibilityLabel("Weight unit")
        Text(eatenMassSummary)
            .rationCaption()
            .foregroundStyle(Theme.muted)
    }

    private var eatenMassSummary: String {
        let each = QuantityEntry.format(CountUnitMass.display(grams: gramsPerUnit, unit: massUnit))
        let totalGrams = quantity * gramsPerUnit
        let total = QuantityEntry.format(CountUnitMass.display(grams: totalGrams, unit: massUnit))
        return "1 \(item.unit) = \(each) \(massUnit). Eating \(QuantityEntry.format(quantity)) \(item.unit) uses \(total) \(massUnit)."
    }

    private var macroEstimate: (
        energyKcal: Double?,
        proteinG: Double?,
        carbsG: Double?,
        fatG: Double?
    ) {
        if needsMassLink {
            return CargoEatMacroEstimate.scaled(
                nutrition: item.nutrition,
                totalGrams: quantity * gramsPerUnit
            )
        }
        return CargoEatMacroEstimate.scaled(
            nutrition: item.nutrition,
            quantity: quantity,
            unit: item.unit,
            packageQuantity: item.quantity
        )
    }

    private func prepareIfNeeded() {
        guard !didPrepare else { return }
        didPrepare = true
        quantity = defaultAmount
        if let suggested = CountUnitMass.suggestedGramsPerUnit(nutrition: item.nutrition) {
            gramsPerUnit = suggested
        }
        massUnit = env.unitDisplayMode.mode == .imperial ? "oz" : "g"
    }

    private var defaultAmount: Double {
        if item.unit == "g" || item.unit == "ml" { return min(100, max(1, item.quantity > 0 ? min(100, item.quantity) : 100)) }
        return 1
    }

    private var step: Double {
        if item.unit == "g" || item.unit == "ml" { return 10 }
        if item.unit == "kg" || item.unit == "l" { return 0.1 }
        return 1
    }

    private func submit() async {
        guard !isSaving, quantity > 0 else { return }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        let notePayload = notesEnabled ? IntakeNotesField.payload(from: notes) : nil
        if needsMassLink {
            do {
                try await persistUnitMassIfNeeded()
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                return
            }
        }
        if let result = await onConfirm(quantity, notePayload) {
            if result.intakeLogged {
                onFinished(result)
                dismiss()
            } else {
                errorMessage = Self.intakeSkipMessage(result.intakeSkipReason)
                onFinished(result)
            }
        } else {
            errorMessage = "Couldn't log this snack. Try again."
        }
    }

    private func persistUnitMassIfNeeded() async throws {
        guard CountUnitMass.shouldPersist(nutrition: item.nutrition, gramsPerUnit: gramsPerUnit),
              let payload = CountUnitMass.snapshot(item.nutrition, gramsPerUnit: gramsPerUnit)
        else { return }
        _ = try await env.api.updateCargo(id: item.id, UpdateCargoRequest(nutrition: payload))
    }

    private static func intakeSkipMessage(_ reason: String?) -> String {
        switch reason {
        case "consent":
            return "Snack is Prepared — open Manifest and accept privacy consent to log macros."
        case "nutrition_unavailable":
            return "Snack is Prepared, but nutrition isn’t ready yet. Open Manifest → Log my serving in a moment."
        case "flag_off":
            return "Snack is Prepared. Personal macro logging isn’t available right now."
        case "error":
            return "Snack is Prepared, but logging your serving failed. Try Log my serving on Manifest."
        default:
            return "Snack is Prepared. Macros weren’t logged — try Log my serving on Manifest."
        }
    }
}
