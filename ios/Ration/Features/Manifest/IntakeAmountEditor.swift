import SwiftUI

struct IntakeAmountEditor: View {
    @Binding var amount: Double
    @Binding var unit: IntakeLoggedUnit
    @Binding var servings: Double
    var gramsPerServing: Double?
    var massUnit: IntakeLoggedUnit
    var enabled: Bool = true
    /// Cargo unit. The amount stays in this unit and is not snapped to 0.25.
    var directUnit: String? = nil

    private var usesDirectQuantity: Bool {
        guard let directUnit else { return false }
        return !directUnit.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var massEnabled: Bool { IntakeAmount.canLogByMass(gramsPerServing) }
    private var servingHint: String? {
        guard massEnabled, let gramsPerServing else { return nil }
        return "1 serving ≈ \(Int(gramsPerServing.rounded())) g from recipe ingredients"
    }

    private var unitLabel: String {
        unit == .serving ? "servings" : unit.rawValue
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            QuantityStepperField(
                value: usesDirectQuantity ? directAmountBinding : amountBinding,
                unit: usesDirectQuantity ? (directUnit ?? unitLabel) : unitLabel,
                range: 0.01...100_000,
                step: usesDirectQuantity
                    ? IntakeAmount.step(forDirectUnit: directUnit ?? "")
                    : IntakeAmount.step(for: unit),
                accessibilityIdentifier: "manifest.eat.amount"
            )
            .disabled(!enabled)
            if massEnabled, !usesDirectQuantity {
                Picker("Unit", selection: unitBinding) {
                    Text("Servings").tag(IntakeLoggedUnit.serving)
                    Text(massUnit.rawValue).tag(massUnit)
                }
                .pickerStyle(.segmented)
                .disabled(!enabled)
                .accessibilityLabel("Amount unit")
            }
            if let servingHint, !usesDirectQuantity {
                Text(servingHint)
                    .rationCaption()
            }
        }
    }

    private var directAmountBinding: Binding<Double> {
        Binding(
            get: { amount },
            set: { next in
                let accepted = IntakeAmount.acceptedDirectQuantity(next, unit: directUnit ?? "")
                amount = accepted
                servings = accepted
            }
        )
    }

    private var amountBinding: Binding<Double> {
        Binding(
            get: { amount },
            set: { apply(amount: $0, unit: unit) }
        )
    }

    private var unitBinding: Binding<IntakeLoggedUnit> {
        Binding(
            get: { unit },
            set: { next in
                if let converted = IntakeAmount.amount(
                    fromServings: servings,
                    unit: next,
                    gramsPerServing: gramsPerServing
                ) {
                    apply(amount: converted, unit: next)
                } else {
                    apply(amount: servings, unit: .serving)
                }
            }
        )
    }

    private func apply(amount nextAmount: Double, unit nextUnit: IntakeLoggedUnit) {
        let resolved = IntakeAmount.clampedResolve(
            amount: nextAmount,
            unit: nextUnit,
            gramsPerServing: gramsPerServing
        )
        amount = resolved.loggedAmount
        unit = resolved.loggedUnit
        servings = resolved.servings
    }
}
