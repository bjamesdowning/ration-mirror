import SwiftUI

/// Editable cargo macros (kcal / protein / carbs / fat) — mirrors web `NutritionPanel` edit mode.
struct NutritionEditorSection: View {
    @Binding var nutrition: NutritionSnapshot?

    @State private var energyText = ""
    @State private var proteinText = ""
    @State private var carbsText = ""
    @State private var fatText = ""
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case energy, protein, carbs, fat
    }

    var body: some View {
        Section {
            HStack {
                Text("Provenance")
                Spacer()
                Text(nutrition?.provenanceLabel ?? "Blank")
                    .foregroundStyle(Theme.muted)
            }
            macroField("Calories (kcal)", text: $energyText, field: .energy)
            macroField("Protein (g)", text: $proteinText, field: .protein)
            macroField("Carbs (g)", text: $carbsText, field: .carbs)
            macroField("Fat (g)", text: $fatText, field: .fat)
        } header: {
            Text("Nutrition")
        } footer: {
            Text("USDA matches and AI estimates are labelled. Editing saves your override for this package.")
        }
        .onAppear(perform: syncFromModel)
        .onChange(of: nutrition) { _, _ in
            // Only re-sync when focus is outside editor fields (e.g. resolve filled snapshot).
            guard focusedField == nil else { return }
            syncFromModel()
        }
    }

    private func macroField(_ title: String, text: Binding<String>, field: Field) -> some View {
        HStack {
            Text(title)
            TextField("—", text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .focused($focusedField, equals: field)
                .onChange(of: text.wrappedValue) { _, _ in
                    commitEdits()
                }
        }
    }

    private func syncFromModel() {
        let values = nutrition?.displayNutrients
        energyText = Self.format(values?.energyKcal)
        proteinText = Self.format(values?.proteinG)
        carbsText = Self.format(values?.carbG)
        fatText = Self.format(values?.fatG)
    }

    private func commitEdits() {
        let energy = Self.parse(energyText)
        let protein = Self.parse(proteinText)
        let carbs = Self.parse(carbsText)
        let fat = Self.parse(fatText)
        if energy == nil, protein == nil, carbs == nil, fat == nil {
            // Keep resolved snapshot until the user types a value; don't wipe USDA/AI on appear.
            if nutrition?.source == "user_override", !(nutrition?.displayNutrients?.hasAnyMacro ?? false) {
                nutrition = nil
            }
            return
        }
        let base = nutrition ?? .blankUserOverride()
        nutrition = base.applyingMacros(
            energyKcal: energy,
            proteinG: protein,
            fatG: fat,
            carbG: carbs
        )
    }

    private static func format(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "" }
        if value.truncatingRemainder(dividingBy: 1) == 0 {
            return String(Int(value))
        }
        return String(format: "%.1f", value)
    }

    private static func parse(_ raw: String) -> Double? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return Double(trimmed)
    }
}
