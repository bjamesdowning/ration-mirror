import SwiftUI

/// Quantity, note, and calorie preview shared by Cargo, Galley, and cook-then-Fuel.
enum FuelAmountEntry {
    /// Flag-off plate-up stays Eat. Flag-on Add to Fuel and plate-up say Fuel.
    static func title(planFuelActionsEnabled: Bool) -> String {
        planFuelActionsEnabled ? "Fuel" : "Eat"
    }

    static func openingQuantity(start: Double, unit: String) -> Double {
        guard start.isFinite, start > 0 else { return 1 }
        return IntakeAmount.acceptedDirectQuantity(start, unit: unit)
    }

    static func acceptedQuantity(_ amount: Double, unit: String) -> Double {
        IntakeAmount.acceptedDirectQuantity(amount, unit: unit)
    }

    static func calorieText(energy: Double?) -> String {
        guard let energy, energy.isFinite, energy >= 0 else { return "" }
        let whole = energy.rounded()
        if whole == energy { return String(Int(whole)) }
        return String(format: "%.1f", energy)
    }

    static func energy(from calorieText: String) -> Double? {
        let trimmed = calorieText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let value = Double(trimmed), value.isFinite, value >= 0 else {
            return nil
        }
        return value
    }

    static func submission(
        quantity: Double,
        unit: String,
        notes: String,
        calorieText: String
    ) -> FuelAmountSubmission {
        FuelAmountSubmission(
            quantity: acceptedQuantity(quantity, unit: unit),
            notes: IntakeNotesField.payload(from: notes),
            energyKcal: energy(from: calorieText)
        )
    }
}

struct FuelAmountSubmission: Equatable, Sendable {
    var quantity: Double
    var notes: String?
    var energyKcal: Double?
}

struct PlanFuelAmountSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let title: String
    let unit: String
    let gramsPerServing: Double?
    let energy: (Double) -> Double?
    let onSave: (FuelAmountSubmission) async throws -> Void
    @State private var amount: Double
    @State private var loggedUnit: IntakeLoggedUnit
    @State private var servings: Double
    @State private var notes: String
    @State private var calorieText: String
    @State private var syncedPreview: String
    @State private var errorMessage: String?

    init(
        title: String,
        unit: String,
        start: Double,
        gramsPerServing: Double? = nil,
        energy: @escaping (Double) -> Double? = { _ in nil },
        onSave: @escaping (FuelAmountSubmission) async throws -> Void
    ) {
        self.title = title
        self.unit = unit
        self.gramsPerServing = gramsPerServing
        self.energy = energy
        self.onSave = onSave
        let opening = FuelAmountEntry.openingQuantity(start: start, unit: unit)
        let preview = FuelAmountEntry.calorieText(energy: energy(opening))
        _amount = State(initialValue: opening)
        _servings = State(initialValue: opening)
        _loggedUnit = State(initialValue: .serving)
        _notes = State(initialValue: "")
        _calorieText = State(initialValue: preview)
        _syncedPreview = State(initialValue: preview)
    }

    private var usesDirectQuantity: Bool {
        let normalized = unit.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized != "serving" && normalized != "servings"
    }

    private var loggedQuantity: Double {
        if usesDirectQuantity {
            return FuelAmountEntry.acceptedQuantity(amount, unit: unit)
        }
        return servings
    }

    private var massUnit: IntakeLoggedUnit {
        IntakeAmount.massUnit(forDisplayMode: env.unitDisplayMode.mode)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    IntakeAmountEditor(
                        amount: $amount,
                        unit: $loggedUnit,
                        servings: $servings,
                        gramsPerServing: gramsPerServing,
                        massUnit: massUnit,
                        directUnit: usesDirectQuantity ? unit : nil
                    )
                } header: {
                    Text("Amount")
                }

                Section {
                    LabeledContent("Calories") {
                        TextField("kcal", text: $calorieText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .accessibilityLabel("Calorie preview")
                    }
                    if calorieText.isEmpty {
                        Text("Nutrition unavailable.")
                            .rationCaption()
                            .foregroundStyle(Theme.muted)
                    }
                } header: {
                    Text("This portion")
                }

                Section {
                    IntakeNotesField(notes: $notes)
                } header: {
                    Text("Notes")
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).rationCaption()
                    }
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
                        Task { await save() }
                    }
                }
            }
            .rationFormKeyboardToolbar()
            .onChange(of: loggedQuantity) { _, quantity in
                let next = FuelAmountEntry.calorieText(energy: energy(quantity))
                if calorieText == syncedPreview {
                    calorieText = next
                }
                syncedPreview = next
            }
        }
    }

    @MainActor
    private func save() async {
        let submission = FuelAmountEntry.submission(
            quantity: loggedQuantity,
            unit: usesDirectQuantity ? unit : "serving",
            notes: notes,
            calorieText: calorieText
        )
        do {
            try await onSave(submission)
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
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
