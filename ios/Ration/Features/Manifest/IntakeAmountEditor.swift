import SwiftUI

struct IntakeAmountEditor: View {
    @Binding var amount: Double
    @Binding var unit: IntakeLoggedUnit
    @Binding var servings: Double
    var gramsPerServing: Double?
    var massUnit: IntakeLoggedUnit
    var enabled: Bool = true

    private var massEnabled: Bool { IntakeAmount.canLogByMass(gramsPerServing) }
    private var step: Double { IntakeAmount.step(for: unit) }
    private var servingHint: String? {
        guard massEnabled, let gramsPerServing else { return nil }
        return "1 serving ≈ \(Int(gramsPerServing.rounded())) g from recipe ingredients"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("How much did you eat?")
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
                .textCase(.uppercase)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(IntakeAmount.presets, id: \.label) { preset in
                        let selected = unit == .serving && abs(servings - preset.value) < 0.005
                        Button(preset.label) {
                            apply(amount: preset.value, unit: .serving)
                        }
                        .buttonStyle(.bordered)
                        .tint(selected ? Theme.hyperGreen : Theme.muted)
                        .disabled(!enabled)
                    }
                }
            }
            HStack(spacing: 8) {
                Button {
                    apply(amount: IntakeAmount.roundLoggedAmount(amount - step, unit: unit), unit: unit)
                } label: {
                    Text("−")
                        .font(Typography.mono(22))
                        .frame(minWidth: 44, minHeight: 44)
                }
                .disabled(!enabled)
                TextField("Amount", value: amountBinding, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.center)
                    .font(Typography.mono(18))
                    .disabled(!enabled)
                    .accessibilityLabel("Amount eaten")
                Button {
                    apply(amount: IntakeAmount.roundLoggedAmount(amount + step, unit: unit), unit: unit)
                } label: {
                    Text("+")
                        .font(Typography.mono(22))
                        .frame(minWidth: 44, minHeight: 44)
                }
                .disabled(!enabled)
            }
            if massEnabled {
                Picker("Unit", selection: unitBinding) {
                    Text("Servings").tag(IntakeLoggedUnit.serving)
                    Text(massUnit.rawValue).tag(massUnit)
                }
                .pickerStyle(.segmented)
                .disabled(!enabled)
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
        guard let resolved = IntakeAmount.resolve(
            amount: nextAmount,
            unit: nextUnit,
            gramsPerServing: gramsPerServing
        ) else { return }
        amount = resolved.loggedAmount
        unit = resolved.loggedUnit
        servings = resolved.servings
    }
}
