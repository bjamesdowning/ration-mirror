import SwiftUI

struct FuelLogRoute: Hashable {
    let id: String
}

/// Edit payload for one Fuel log. Keeps the row's macros, amount, time, and note.
struct FuelLogWrite: Identifiable, Equatable {
    var id: String
    var name: String
    var occurredAt: String
    var amount: Double
    var unit: String
    var energy: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    var notes: String?
    var source: String

    static func editing(_ item: FuelDayResponse.Item) -> FuelLogWrite {
        FuelLogWrite(
            id: item.id,
            name: item.name,
            occurredAt: item.occurredAt,
            amount: item.loggedAmount ?? item.servings ?? 1,
            unit: item.loggedUnit ?? "serving",
            energy: item.energyKcal,
            protein: item.proteinG,
            carbs: item.carbsG,
            fat: item.fatG,
            notes: IntakeNotesField.payload(from: item.notes ?? ""),
            source: "manual_macros"
        )
    }

    func body(key: String) -> DiaryFoodBody {
        DiaryFoodBody(
            name: name,
            occurredAt: occurredAt,
            amount: amount,
            unit: unit,
            macros: DiaryMacrosBody(
                energyKcal: energy,
                proteinG: protein,
                carbsG: carbs,
                fatG: fat
            ),
            idempotencyKey: key,
            operationKey: key,
            compositionSource: source,
            notes: notes
        )
    }

    static func field(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(value)
    }

    /// One decimal for kcal and grams. Trailing zeros drop.
    static func macroDisplay(_ value: Double) -> String {
        let rounded = (value * 10).rounded() / 10
        if rounded.rounded() == rounded { return String(Int(rounded)) }
        return String(format: "%.1f", rounded)
    }

    static func amountDisplay(_ value: Double, unit: String) -> String {
        switch unit {
        case "g":
            return macroDisplay(value)
        case "oz":
            let rounded = (value * 100).rounded() / 100
            if rounded.rounded() == rounded { return String(Int(rounded)) }
            return String(format: "%.2f", rounded)
        default:
            return QuantityEntry.format(value)
        }
    }

    /// Unedited text keeps the stored double. Edited text parses what was typed.
    static func storedValue(original: Double, display: String, edited: String) -> Double? {
        if edited == display { return original }
        return Double(edited)
    }
}

struct FuelLogDetailView: View {
    let item: FuelDayResponse.Item
    var onEdit: () -> Void
    var onDelete: () -> Void
    @State private var confirmingDelete = false

    var body: some View {
        List {
            Section {
                detailRow("Time", FuelLogClock.text(from: item.occurredAt))
                if let slot = FuelLogClock.slotLabel(item.slotType) {
                    detailRow("Slot", slot)
                }
                detailRow("Energy", "\(Int(item.energyKcal.rounded())) kcal")
                detailRow("Protein", grams(item.proteinG))
                detailRow("Carbs", grams(item.carbsG))
                detailRow("Fat", grams(item.fatG))
                if let amount = amountLine {
                    detailRow("Amount", amount)
                }
                if let note = item.notes?.trimmingCharacters(in: .whitespacesAndNewlines), !note.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Note").rationCaption()
                        Text(note).rationBody()
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 4)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .navigationTitle(item.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Edit", action: onEdit)
            }
            ToolbarItem(placement: .bottomBar) {
                Button("Delete", role: .destructive) { confirmingDelete = true }
            }
        }
        .confirmationDialog("Delete this log?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive, action: onDelete)
            Button("Cancel", role: .cancel) {}
        }
    }

    private var amountLine: String? {
        if let amount = item.loggedAmount, let unit = item.loggedUnit, !unit.isEmpty {
            return "\(FuelLogWrite.amountDisplay(amount, unit: unit)) \(unit)"
        }
        if let servings = item.servings {
            let noun = servings == 1 ? "serving" : "servings"
            return "\(FuelLogWrite.amountDisplay(servings, unit: "serving")) \(noun)"
        }
        return nil
    }

    private func grams(_ value: Double) -> String {
        "\(FuelLogWrite.macroDisplay(value)) g"
    }

    private func detailRow(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).rationCaption()
            Spacer(minLength: 8)
            Text(value).rationBody()
        }
        .padding(.vertical, 4)
    }
}

struct FuelLogEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var calories: String
    @State private var protein: String
    @State private var carbs: String
    @State private var fat: String
    @State private var amount: String
    @State private var unit: String
    @State private var notes: String
    private let draft: FuelLogWrite
    var onSave: (FuelLogWrite) -> Void

    init(draft: FuelLogWrite, onSave: @escaping (FuelLogWrite) -> Void) {
        self.draft = draft
        self.onSave = onSave
        _name = State(initialValue: draft.name)
        _calories = State(initialValue: FuelLogWrite.macroDisplay(draft.energy))
        _protein = State(initialValue: FuelLogWrite.macroDisplay(draft.protein))
        _carbs = State(initialValue: FuelLogWrite.macroDisplay(draft.carbs))
        _fat = State(initialValue: FuelLogWrite.macroDisplay(draft.fat))
        _amount = State(initialValue: FuelLogWrite.amountDisplay(draft.amount, unit: draft.unit))
        _unit = State(initialValue: draft.unit == "serving" || draft.unit == "g" || draft.unit == "oz" ? draft.unit : "serving")
        _notes = State(initialValue: draft.notes ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Food") {
                    LabeledContent("Name") {
                        TextField("Name", text: $name)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Amount") {
                        TextField("Amount", text: $amount)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                    Picker("Unit", selection: $unit) {
                        Text("serving").tag("serving")
                        Text("g").tag("g")
                        Text("oz").tag("oz")
                    }
                }
                Section("Nutrition") {
                    labeledNumber("Calories (kcal)", text: $calories)
                    labeledNumber("Protein (g)", text: $protein)
                    labeledNumber("Carbs (g)", text: $carbs)
                    labeledNumber("Fat (g)", text: $fat)
                }
                IntakeNotesField(notes: $notes)
            }
            .navigationTitle("Edit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                }
            }
        }
    }

    private func labeledNumber(_ title: String, text: Binding<String>) -> some View {
        LabeledContent(title) {
            TextField(title, text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
        }
    }

    private func save() {
        guard
            let energy = FuelLogWrite.storedValue(
                original: draft.energy,
                display: FuelLogWrite.macroDisplay(draft.energy),
                edited: calories
            ), energy >= 0,
            let proteinValue = FuelLogWrite.storedValue(
                original: draft.protein,
                display: FuelLogWrite.macroDisplay(draft.protein),
                edited: protein
            ), proteinValue >= 0,
            let carbsValue = FuelLogWrite.storedValue(
                original: draft.carbs,
                display: FuelLogWrite.macroDisplay(draft.carbs),
                edited: carbs
            ), carbsValue >= 0,
            let fatValue = FuelLogWrite.storedValue(
                original: draft.fat,
                display: FuelLogWrite.macroDisplay(draft.fat),
                edited: fat
            ), fatValue >= 0,
            let amountValue = FuelLogWrite.storedValue(
                original: draft.amount,
                display: FuelLogWrite.amountDisplay(draft.amount, unit: draft.unit),
                edited: amount
            ), amountValue > 0
        else { return }
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard unit == "serving" || unit == "g" || unit == "oz" else { return }
        var next = draft
        next.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        next.energy = energy
        next.protein = proteinValue
        next.carbs = carbsValue
        next.fat = fatValue
        next.amount = amountValue
        next.unit = unit
        next.notes = IntakeNotesField.payload(from: notes)
        onSave(next)
    }
}

enum FuelLogClock {
    static func text(from iso: String) -> String {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        guard let date = fractional.date(from: iso) ?? plain.date(from: iso) else { return iso }
        let display = DateFormatter()
        display.dateStyle = .medium
        display.timeStyle = .short
        return display.string(from: date)
    }

    static func slotLabel(_ raw: String?) -> String? {
        switch raw {
        case "breakfast": "Breakfast"
        case "lunch": "Lunch"
        case "dinner": "Dinner"
        case "snack": "Snack"
        case nil, "": nil
        default: raw
        }
    }
}
