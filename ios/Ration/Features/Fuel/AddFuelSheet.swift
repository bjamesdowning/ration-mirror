import SwiftUI

/// Manual Add Fuel. Search and tags do not call a model or spend credits.
struct AddFuelSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    var fuelDate: String
    var onSaved: () -> Void
    var onError: (Error) -> Void

    @State private var logDay: Date?
    @State private var query = ""
    @State private var cargoPage: [CargoItem] = []
    @State private var searchHits: [SearchResult] = []
    @State private var meals: [Meal] = []
    @State private var selectedTags: Set<String> = []
    @State private var selection: Selection?
    @State private var amountText = "1"
    @State private var energyText = ""
    @State private var proteinText = ""
    @State private var carbsText = ""
    @State private var fatText = ""
    @State private var touched: Set<MacroField> = []
    @State private var manualName = ""
    @State private var manualAmount = "1"
    @State private var manualUnit = "serving"
    @State private var manualEnergy = ""
    @State private var manualProtein = ""
    @State private var manualCarbs = ""
    @State private var manualFat = ""
    @State private var manualTags: [String] = []
    @State private var tagDraft = ""
    @State private var searching = false
    @State private var showingLimitPaywall = false

    private enum MacroField { case energy, protein, carbs, fat }

    private enum Selection {
        case cargo(CargoItem)
        case meal(Meal)
    }

    private var chosenFuelDate: String {
        LocalDay.isoString(from: logDay ?? LocalDay.date(from: fuelDate) ?? Date())
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker(
                        "Date",
                        selection: Binding(
                            get: { logDay ?? LocalDay.date(from: fuelDate) ?? Date() },
                            set: { logDay = $0 }
                        ),
                        displayedComponents: .date
                    )
                }
                Section {
                    TextField("Search Cargo and Galley", text: $query)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if !suggestionNames.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(suggestionNames, id: \.self) { name in
                                    Button(name) { toggleTag(name) }
                                        .buttonStyle(.borderedProminent)
                                        .tint(selectedTags.contains(name) ? .green : .secondary)
                                }
                            }
                        }
                    }
                    Menu {
                        Section("Cargo") {
                            if cargoRows.isEmpty {
                                Button(searching ? "Searching" : "No cargo matches.") {}
                                    .disabled(true)
                            } else {
                                ForEach(cargoRows, id: \.id) { row in
                                    Button(row.name) { Task { await pickCargo(row) } }
                                }
                            }
                        }
                        Section("Galley") {
                            if mealRows.isEmpty {
                                Button("No meals match.") {}
                                    .disabled(true)
                            } else {
                                ForEach(mealRows, id: \.id) { meal in
                                    Button(meal.name) { pickMeal(meal) }
                                }
                            }
                        }
                    } label: {
                        Text(kitchenLabel)
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                }
                if selection != nil {
                    Section("Amount") {
                        LabeledContent("Amount") {
                            TextField("Amount", text: $amountText)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .trailing)
                        }
                        LabeledContent("Unit") {
                            Text(selectionUnit).rationBody()
                        }
                        macroField("Calories (kcal)", text: $energyText, field: .energy)
                        macroField("Protein (g)", text: $proteinText, field: .protein)
                        macroField("Carbs (g)", text: $carbsText, field: .carbs)
                        macroField("Fat (g)", text: $fatText, field: .fat)
                        Button("Add to Fuel") { Task { await saveSelection() } }
                            .frame(minHeight: 44)
                    }
                }
                Section("Typed") {
                    LabeledContent("Name") {
                        TextField("Name", text: $manualName)
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .trailing)
                    }
                    LabeledContent("Amount") {
                        TextField("Amount", text: $manualAmount)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .trailing)
                    }
                    Picker("Unit", selection: $manualUnit) {
                        Text("serving").tag("serving")
                        Text("g").tag("g")
                        Text("oz").tag("oz")
                    }
                    labeledManual("Calories (kcal)", text: $manualEnergy)
                    labeledManual("Protein (g)", text: $manualProtein)
                    labeledManual("Carbs (g)", text: $manualCarbs)
                    labeledManual("Fat (g)", text: $manualFat)
                    LabeledContent("Tags") {
                        TextField("Tag", text: $tagDraft)
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .trailing)
                    }
                    Button("Add tag") { addManualTag() }
                        .frame(minHeight: 44)
                    if !manualTags.isEmpty {
                        Text(manualTags.joined(separator: ", ")).rationCaption()
                    }
                    Button("Add to Fuel") { Task { await saveManual() } }
                        .frame(minHeight: 44)
                }
            }
            .navigationTitle("Add Fuel")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .rationFormKeyboardToolbar()
            .task { await loadSuggestions() }
            .task(id: query) { await refreshSearch() }
            .onChange(of: amountText) { _, _ in applyScaledMacros() }
            .sheet(isPresented: $showingLimitPaywall) { PaywallView(context: .settings()) }
        }
    }

    private var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var suggestionNames: [String] {
        var seen: Set<String> = []
        var names: [String] = []
        func collect(_ tags: [Tag]) {
            for tag in tags where seen.insert(tag.name).inserted && !tag.name.isEmpty {
                names.append(tag.name)
            }
        }
        for item in cargoPage { collect(item.tags) }
        for meal in meals { collect(meal.tags) }
        return names.sorted()
    }

    private var kitchen: AddFuelKitchen.Picker {
        AddFuelKitchen.picker(
            query: query,
            selectedTags: selectedTags,
            cargoPage: cargoPage.map {
                .init(id: $0.id, name: $0.name, tagNames: $0.tags.map(\.name))
            },
            searchHits: searchHits.map { .init(id: $0.id, name: $0.name) },
            meals: meals.map {
                .init(id: $0.id, name: $0.name, tagNames: $0.tags.map(\.name))
            }
        )
    }

    private var kitchenLabel: String {
        switch selection {
        case .cargo(let item): item.name
        case .meal(let meal): meal.name
        case nil: "Cargo and Galley"
        }
    }

    private var cargoRows: [SearchResult] {
        kitchen.cargo.compactMap { hit in
            if let found = searchHits.first(where: { $0.id == hit.id }) { return found }
            guard let item = cargoPage.first(where: { $0.id == hit.id }) else { return nil }
            return SearchResult(
                id: item.id,
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                baseQuantity: item.baseQuantity,
                baseUnit: item.baseUnit,
                domain: item.domain
            )
        }
    }

    private var mealRows: [Meal] {
        kitchen.meals.compactMap { row in meals.first { $0.id == row.id } }
    }

    private var selectionUnit: String {
        switch selection {
        case .cargo(let item): item.unit
        case .meal: "serving"
        case nil: ""
        }
    }

    private func macroField(_ label: String, text: Binding<String>, field: MacroField) -> some View {
        LabeledContent(label) {
            TextField(label, text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .trailing)
                .onChange(of: text.wrappedValue) { _, newValue in
                    guard let scaled = scaledMacros() else {
                        touched.insert(field)
                        return
                    }
                    if newValue != display(macroValue(scaled, field)) {
                        touched.insert(field)
                    }
                }
        }
    }

    private func labeledManual(_ label: String, text: Binding<String>) -> some View {
        LabeledContent(label) {
            TextField(label, text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .trailing)
        }
    }

    private func macroValue(_ macros: AddFuelScaling.Macros, _ field: MacroField) -> Double {
        switch field {
        case .energy: macros.energyKcal
        case .protein: macros.proteinG
        case .carbs: macros.carbsG
        case .fat: macros.fatG
        }
    }

    private func toggleTag(_ name: String) {
        if selectedTags.contains(name) { selectedTags.remove(name) } else { selectedTags.insert(name) }
    }

    private func loadSuggestions() async {
        if !env.network.isOnline { return }
        if let page = try? await env.api.cargo(limit: 50) {
            cargoPage = page.items
        }
        if let response = try? await env.api.meals(limit: 50) {
            meals = response.meals
        }
    }

    private func refreshSearch() async {
        let text = trimmedQuery
        guard text.count >= 2, env.network.isOnline else {
            searchHits = []
            if text.count < 2 { await reloadMeals() }
            return
        }
        searching = true
        defer { searching = false }
        if let found = try? await env.api.search(query: text) {
            searchHits = found.results
        }
        if let response = try? await env.api.meals(q: text) {
            meals = response.meals
        }
    }

    private func reloadMeals() async {
        guard env.network.isOnline else { return }
        if let response = try? await env.api.meals(limit: 50) {
            meals = response.meals
        }
    }

    private func pickCargo(_ row: SearchResult) async {
        guard let detail = try? await env.api.cargoItem(id: row.id) else { return }
        selection = .cargo(detail.item)
        amountText = "1"
        touched = []
        applyScaledMacros()
    }

    private func pickMeal(_ meal: Meal) {
        selection = .meal(meal)
        amountText = "1"
        touched = []
        applyScaledMacros()
    }

    private func applyScaledMacros() {
        guard let scaled = scaledMacros() else { return }
        if !touched.contains(.energy) { energyText = display(scaled.energyKcal) }
        if !touched.contains(.protein) { proteinText = display(scaled.proteinG) }
        if !touched.contains(.carbs) { carbsText = display(scaled.carbsG) }
        if !touched.contains(.fat) { fatText = display(scaled.fatG) }
    }

    private func scaledMacros() -> AddFuelScaling.Macros? {
        let amount = Double(amountText) ?? 0
        switch selection {
        case .cargo(let item):
            if let per100 = item.nutrition?.per100g,
               let scaled = AddFuelScaling.fromPer100g(
                energyKcal: per100.energyKcal ?? 0,
                proteinG: per100.proteinG ?? 0,
                carbG: per100.carbG ?? 0,
                fatG: per100.fatG ?? 0,
                quantity: amount,
                unit: item.unit
               ) {
                return scaled
            }
            guard let per = item.nutrition?.perServing else { return nil }
            return AddFuelScaling.meal(
                perServing: .init(
                    energyKcal: per.energyKcal ?? 0,
                    proteinG: per.proteinG ?? 0,
                    carbsG: per.carbG ?? 0,
                    fatG: per.fatG ?? 0
                ),
                servings: amount
            )
        case .meal(let meal):
            guard let per = meal.nutrition?.perServing else { return nil }
            return AddFuelScaling.meal(
                perServing: .init(
                    energyKcal: per.energyKcal ?? 0,
                    proteinG: per.proteinG ?? 0,
                    carbsG: per.carbG ?? 0,
                    fatG: per.fatG ?? 0
                ),
                servings: amount
            )
        case nil:
            return nil
        }
    }

    private func saveSelection() async {
        guard env.network.isOnline else {
            onError(AddFuelOfflineError())
            return
        }
        guard let selection, let amount = Double(amountText), amount > 0 else { return }
        let macros = readMacros(energyText, proteinText, carbsText, fatText)
        guard let macros else { return }
        let name: String
        let unit: String
        let source: String
        let tags: [DiaryTagName]
        switch selection {
        case .cargo(let item):
            name = item.name
            unit = item.unit
            source = "manual_macros"
            tags = item.tags.map { DiaryTagName(name: $0.name, slug: $0.slug) }
        case .meal(let meal):
            name = meal.name
            unit = "serving"
            source = "meal"
            tags = meal.tags.map { DiaryTagName(name: $0.name, slug: $0.slug) }
        }
        await post(name: name, amount: amount, unit: unit, macros: macros, source: source, tags: tags)
    }

    private func saveManual() async {
        guard env.network.isOnline else {
            onError(AddFuelOfflineError())
            return
        }
        let name = manualName.trimmingCharacters(in: .whitespacesAndNewlines)
        let unit = manualUnit.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, !unit.isEmpty, let amount = Double(manualAmount), amount > 0 else { return }
        guard let macros = readMacros(manualEnergy, manualProtein, manualCarbs, manualFat) else { return }
        let tags = manualTags.map { DiaryTagName(name: $0, slug: nil) }
        await post(name: name, amount: amount, unit: unit, macros: macros, source: "manual_macros", tags: tags)
    }

    private func post(
        name: String,
        amount: Double,
        unit: String,
        macros: AddFuelScaling.Macros,
        source: String,
        tags: [DiaryTagName]
    ) async {
        let key = UUID().uuidString
        let body = DiaryFoodBody(
            name: name,
            occurredAt: ISO8601DateFormatter().string(from: Date()),
            amount: amount,
            unit: unit,
            macros: DiaryMacrosBody(
                energyKcal: macros.energyKcal,
                proteinG: macros.proteinG,
                carbsG: macros.carbsG,
                fatG: macros.fatG
            ),
            idempotencyKey: key,
            operationKey: key,
            compositionSource: source,
            tagNames: tags.isEmpty ? nil : tags,
            fuelDate: chosenFuelDate
        )
        do {
            _ = try await env.api.logDiaryFood(body)
            onSaved()
            dismiss()
        } catch {
            if FuelSaveLimit.presentsPaywall(code: (error as? APIError)?.code) {
                showingLimitPaywall = true
                return
            }
            onError(error)
        }
    }

    private func readMacros(_ energy: String, _ protein: String, _ carbs: String, _ fat: String) -> AddFuelScaling.Macros? {
        guard let energyKcal = Double(energy), energyKcal >= 0,
              let proteinG = Double(protein), proteinG >= 0,
              let carbsG = Double(carbs), carbsG >= 0,
              let fatG = Double(fat), fatG >= 0 else { return nil }
        return .init(energyKcal: energyKcal, proteinG: proteinG, carbsG: carbsG, fatG: fatG)
    }

    private func addManualTag() {
        let name = tagDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 100, manualTags.count < 10, !manualTags.contains(name) else { return }
        manualTags.append(name)
        tagDraft = ""
    }

    private func display(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(value)
    }
}

private struct AddFuelOfflineError: Error {}
