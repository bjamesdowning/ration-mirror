import SwiftUI

struct IntakeAmountEditor: View {
    @Binding var amount: Double
    @Binding var unit: IntakeLoggedUnit
    @Binding var servings: Double
    var gramsPerServing: Double?
    var massUnit: IntakeLoggedUnit
    var enabled: Bool = true

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
                value: amountBinding,
                unit: unitLabel,
                range: 0.01...100_000,
                step: IntakeAmount.step(for: unit),
                accessibilityIdentifier: "manifest.eat.amount"
            )
            .disabled(!enabled)
            if massEnabled {
                Picker("Unit", selection: unitBinding) {
                    Text("Servings").tag(IntakeLoggedUnit.serving)
                    Text(massUnit.rawValue).tag(massUnit)
                }
                .pickerStyle(.segmented)
                .disabled(!enabled)
                .accessibilityLabel("Amount unit")
            }
            if let servingHint {
                Text(servingHint)
                    .rationCaption()
            }
        }
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
