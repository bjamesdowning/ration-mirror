import SwiftUI

/// Shared quantity rules for steppers and the Custom keypad.
enum QuantityEntry {
    static func step(for unit: String) -> Double {
        switch unit.lowercased() {
        case "g", "ml", "gram", "grams":
            return 10
        case "kg", "l":
            return 0.1
        case "oz":
            return 0.5
        case "lb", "cup", "tbsp", "tsp":
            return 0.25
        default:
            return 1
        }
    }

    static func format(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = .current
        formatter.numberStyle = .decimal
        formatter.usesGroupingSeparator = false
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    /// Parses a keypad draft and clamps it into `range`. Nil when the text is not a quantity.
    static func parse(_ text: String, range: ClosedRange<Double>) -> Double? {
        let allowZero = range.lowerBound <= 0
        guard case let .valid(number) = QuantityValidation.validate(text, allowZero: allowZero) else {
            return nil
        }
        return min(range.upperBound, max(range.lowerBound, number))
    }
}

/// Stepper first, with Custom revealing a decimal keypad for an exact amount.
struct QuantityStepperField: View {
    @Binding var value: Double
    var unit: String
    var title: String = "Amount"
    var range: ClosedRange<Double> = 0...9_999
    var step: Double?
    var accessibilityIdentifier: String?

    @State private var showingCustom = false
    @State private var draft = ""
    @FocusState private var draftFocused: Bool

    private var resolvedStep: Double {
        step ?? QuantityEntry.step(for: unit)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Stepper {
                Text(amountLabel)
            } onIncrement: {
                nudge(resolvedStep)
            } onDecrement: {
                nudge(-resolvedStep)
            }
            .accessibilityIdentifier(accessibilityIdentifier ?? "")

            Button(showingCustom ? "Done" : "Custom") {
                if showingCustom {
                    finishCustom()
                } else {
                    draft = QuantityEntry.format(value)
                    showingCustom = true
                    draftFocused = true
                }
            }
            .font(Typography.caption())
            .foregroundStyle(Theme.hyperGreen)
            .accessibilityHint(showingCustom ? "Saves the typed amount" : "Type an exact amount")

            if showingCustom {
                TextField("Amount", text: $draft)
                    .keyboardType(.decimalPad)
                    .font(Typography.mono(22))
                    .focused($draftFocused)
                    .accessibilityLabel("Custom \(title.lowercased())")
                    .onAppear { draftFocused = true }
                    .onChange(of: draftFocused) { _, focused in
                        if !focused, showingCustom {
                            finishCustom()
                        }
                    }
            }
        }
    }

    private var amountLabel: String {
        let amount = "\(title): \(QuantityEntry.format(value))"
        let trimmedUnit = unit.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedUnit.isEmpty ? amount : "\(amount) \(trimmedUnit)"
    }

    private func nudge(_ delta: Double) {
        let base = showingCustom ? (QuantityEntry.parse(draft, range: range) ?? value) : value
        let next = base + delta
        guard next + 0.000_001 >= range.lowerBound, next - 0.000_001 <= range.upperBound else { return }
        value = next
        if showingCustom {
            draft = QuantityEntry.format(next)
        }
    }

    private func finishCustom() {
        if let parsed = QuantityEntry.parse(draft, range: range) {
            value = parsed
        }
        showingCustom = false
        draftFocused = false
    }
}

/// Stepper + Custom for forms that still store the quantity as text.
struct QuantityStringStepperField: View {
    @Binding var text: String
    var unit: String
    var title: String = "Quantity"
    var allowZero: Bool = false

    private var range: ClosedRange<Double> {
        allowZero ? 0...9_999 : 0.01...9_999
    }

    private var value: Binding<Double> {
        Binding(
            get: {
                QuantityEntry.parse(text, range: range) ?? (allowZero ? 0 : 1)
            },
            set: { text = QuantityEntry.format($0) }
        )
    }

    var body: some View {
        QuantityStepperField(
            value: value,
            unit: unit,
            title: title,
            range: range
        )
    }
}
