import SwiftUI

struct PlanFuelAmountSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let unit: String
    let start: Double
    let onSave: (Double) async throws -> Void
    @State private var amount: Double
    @State private var errorMessage: String?

    init(title: String, unit: String, start: Double, onSave: @escaping (Double) async throws -> Void) {
        self.title = title
        self.unit = unit
        self.start = max(start, 0.25)
        self.onSave = onSave
        _amount = State(initialValue: max(start, 0.25))
    }

    var body: some View {
        NavigationStack {
            Form {
                Stepper(value: $amount, in: 0.25...99, step: 0.25) {
                    Text("\(FuelLogWrite.amountDisplay(amount, unit: unit)) \(unit)")
                }
                if let errorMessage {
                    Text(errorMessage).rationCaption()
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            do {
                                try await onSave(amount)
                                dismiss()
                            } catch {
                                errorMessage = "Could not add this to Fuel."
                            }
                        }
                    }
                }
            }
        }
    }
}

struct CargoPlanSheet: View {
    @Environment(\.dismiss) private var dismiss
    let cargoId: String
    let unit: String
    let onSave: (String, String, Double) async throws -> Void
    @State private var date = Date()
    @State private var slot = "dinner"
    @State private var quantity = 1.0
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("Date", selection: $date, displayedComponents: .date)
                Picker("Slot", selection: $slot) {
                    ForEach(["breakfast", "lunch", "dinner", "snack"], id: \.self) { item in
                        Text(item.capitalized).tag(item)
                    }
                }
                Stepper(value: $quantity, in: 0.25...99, step: 0.25) {
                    Text("\(FuelLogWrite.amountDisplay(quantity, unit: unit)) \(unit)")
                }
                if let errorMessage {
                    Text(errorMessage).rationCaption()
                }
            }
            .navigationTitle("Add to Manifest")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            do {
                                try await onSave(Self.iso(date), slot, quantity)
                                dismiss()
                            } catch {
                                errorMessage = "Could not add this to Manifest."
                            }
                        }
                    }
                }
            }
        }
    }

    private static func iso(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = .current
        return formatter.string(from: date)
    }
}

struct ManifestLineEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    let entry: ManifestEntry
    let onSave: (String, String, Int) async throws -> Void
    @State private var date: Date
    @State private var slot: String
    @State private var servings: Int
    @State private var errorMessage: String?

    init(entry: ManifestEntry, onSave: @escaping (String, String, Int) async throws -> Void) {
        self.entry = entry
        self.onSave = onSave
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = .current
        _date = State(initialValue: formatter.date(from: entry.date) ?? Date())
        _slot = State(initialValue: entry.slotType)
        _servings = State(initialValue: max(1, entry.servingsOverride ?? entry.mealServings))
    }

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("Date", selection: $date, displayedComponents: .date)
                Picker("Slot", selection: $slot) {
                    ForEach(["breakfast", "lunch", "dinner", "snack"], id: \.self) { item in
                        Text(item.capitalized).tag(item)
                    }
                }
                Stepper("Servings: \(servings)", value: $servings, in: 1...24)
                if let errorMessage {
                    Text(errorMessage).rationCaption()
                }
            }
            .navigationTitle("Edit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            do {
                                try await onSave(Self.iso(date), slot, servings)
                                dismiss()
                            } catch {
                                errorMessage = "Could not update this line."
                            }
                        }
                    }
                }
            }
        }
    }

    private static func iso(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = .current
        return formatter.string(from: date)
    }
}

struct ManifestLineSwipe: ViewModifier {
    let planFuelActions: Bool
    let cooked: Bool
    let onEdit: () -> Void
    let onSoft: () -> Void
    let onDelete: () -> Void

    func body(content: Content) -> some View {
        if planFuelActions {
            content
                .swipeActions(edge: .leading, allowsFullSwipe: false) {
                    Button(action: onEdit) {
                        Label("Edit", systemImage: "pencil")
                    }
                    .tint(Theme.hyperGreen)
                }
                .manifestTrailingSwipeActions(
                    softLabel: cooked ? "Fuel" : "Cook",
                    softSystemImage: cooked ? "flame.fill" : "fork.knife.circle.fill",
                    onSoft: onSoft,
                    onDelete: onDelete
                )
        } else {
            content.destructiveTrailingSwipe(onDelete: onDelete)
        }
    }
}
