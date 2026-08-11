import SwiftUI

/// Single-sheet Cargo Quick Eat: choose amount → confirm → done.
struct CargoQuickEatSheet: View {
    @Environment(\.dismiss) private var dismiss
    let item: CargoItem
    var onConfirm: (Double) async -> CargoQuickEatResponse?
    var onFinished: (CargoQuickEatResponse) -> Void = { _ in }

    @State private var quantity: Double = 1
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var stockEmpty: Bool { item.quantity <= 0 }
    private var remaining: Double { max(0, item.quantity - quantity) }

    var body: some View {
        NavigationStack {
            Form {
                Section(item.name.capitalized) {
                    Stepper(value: $quantity, in: stepRange, step: step) {
                        Text("Amount: \(quantity.formatted()) \(item.unit)")
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
            }
        }
        .presentationDetents([.medium])
        .onAppear {
            quantity = defaultAmount
        }
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

    private var stepRange: ClosedRange<Double> {
        step...1000
    }

    private func submit() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        if let result = await onConfirm(quantity) {
            onFinished(result)
            dismiss()
        } else {
            errorMessage = "Couldn’t log that snack. Try again."
        }
    }
}

enum CargoLocalDate {
    static func todayString(from date: Date = Date()) -> String {
        let f = DateFormatter()
        f.calendar = Calendar.current
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
