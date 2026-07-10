import SwiftUI

struct EditableMealIngredient: Identifiable, Equatable {
    let id: String
    var ingredientName: String
    var quantity: Double
    var unit: String
    var cargoId: String?
    var isOptional: Bool

    init(from ingredient: MealIngredient) {
        id = ingredient.id
        ingredientName = ingredient.ingredientName
        quantity = ingredient.quantity
        unit = ingredient.unit
        cargoId = ingredient.cargoId
        isOptional = ingredient.isOptional ?? false
    }

    init() {
        id = UUID().uuidString
        ingredientName = ""
        quantity = 1
        unit = "g"
        cargoId = nil
        isOptional = false
    }

    func toRequest(orderIndex: Int) -> CreateMealIngredientRequest {
        CreateMealIngredientRequest(
            ingredientName: ingredientName.trimmingCharacters(in: .whitespaces).lowercased(),
            quantity: quantity,
            unit: unit,
            cargoId: cargoId,
            isOptional: isOptional,
            orderIndex: orderIndex
        )
    }

    mutating func link(to cargo: CargoItem) {
        cargoId = cargo.id
        ingredientName = cargo.name
        unit = cargo.unit
    }

    mutating func unlinkCargo() {
        cargoId = nil
    }
}

struct MealIngredientEditorView: View {
    @Binding var ingredients: [EditableMealIngredient]
    let cargoItems: [CargoItem]
    @FocusState private var focusedQuantityId: String?

    var body: some View {
        ForEach($ingredients) { $ingredient in
            VStack(alignment: .leading, spacing: 8) {
                TextField("Ingredient name", text: $ingredient.ingredientName)
                    .textInputAutocapitalization(.never)
                    .disabled(ingredient.cargoId != nil)

                cargoLinkRow(ingredient: $ingredient)

                HStack {
                    TextField("Qty", value: $ingredient.quantity, format: .number)
                        .keyboardType(.decimalPad)
                        .focused($focusedQuantityId, equals: ingredient.id)
                        .frame(maxWidth: 80)
                    UnitPicker(units: RationUnits.all, selection: $ingredient.unit)
                }
                Toggle("Optional", isOn: $ingredient.isOptional)
            }
            .padding(.vertical, 4)
        }
        .onDelete { indices in
            ingredients.remove(atOffsets: indices)
        }
        .rationFormKeyboardToolbar { focusedQuantityId = nil }

        Button {
            ingredients.append(EditableMealIngredient())
        } label: {
            Label("Add ingredient", systemImage: "plus.circle")
        }
    }

    @ViewBuilder
    private func cargoLinkRow(ingredient: Binding<EditableMealIngredient>) -> some View {
        if let linkedId = ingredient.wrappedValue.cargoId,
           let linked = cargoItems.first(where: { $0.id == linkedId }) {
            HStack {
                Label(linked.name.capitalized, systemImage: "link")
                    .rationCaption()
                    .foregroundStyle(Theme.hyperGreen)
                Spacer()
                Button("Unlink") {
                    ingredient.wrappedValue.unlinkCargo()
                }
                .font(Typography.caption())
            }
        } else {
            Menu {
                if matchingCargo(for: ingredient.wrappedValue).isEmpty {
                    Text("No matching cargo")
                }
                ForEach(matchingCargo(for: ingredient.wrappedValue)) { item in
                    Button(item.name.capitalized) {
                        ingredient.wrappedValue.link(to: item)
                    }
                }
                if !ingredient.wrappedValue.ingredientName.isEmpty {
                    Divider()
                }
                ForEach(cargoItems.prefix(12)) { item in
                    Button(item.name.capitalized) {
                        ingredient.wrappedValue.link(to: item)
                    }
                }
            } label: {
                Label("Link to cargo", systemImage: "shippingbox")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    private func matchingCargo(for ingredient: EditableMealIngredient) -> [CargoItem] {
        let needle = ingredient.ingredientName.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return [] }
        return cargoItems.filter { $0.name.localizedCaseInsensitiveContains(needle) }.prefix(8).map { $0 }
    }
}
