import SwiftUI

/// Manual Add Fuel. Search and tags do not call a model or spend credits.
struct AddFuelSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    var onSaved: () -> Void
    var onError: (Error) -> Void

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

    private enum MacroField { case energy, protein, carbs, fat }

    private enum Selection {
        case cargo(CargoItem)
        case meal(Meal)
    }

    var body: some View {
        NavigationStack {
            Form {
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
                }
                Section("Cargo") {
                    if cargoRows.isEmpty {
                        Text(searching ? "Searching" : "No cargo matches.").rationCaption()
                    }
                    ForEach(cargoRows, id: \.id) { row in
                        Button(row.name) { Task { await pickCargo(row) } }
                            .frame(minHeight: 44)
                    }
                }
                Section("Galley") {
                    if mealRows.isEmpty {
                        Text("No meals match.").rationCaption()
                    }
                    ForEach(mealRows, id: \.id) { meal in
                        Button(meal.name) { pickMeal(meal) }
                            .frame(minHeight: 44)
                    }
                }
                if let selection {
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

    private var cargoRows: [SearchResult] {
        let names = Array(selectedTags)
        let base: [SearchResult]
        if trimmedQuery.count >= 2 {
            base = searchHits
        } else if trimmedQuery.count == 1 {
            let needle = trimmedQuery.lowercased()
            base = cargoPage
                .filter { $0.name.lowercased().contains(needle) }
                .map { SearchResult(id: $0.id, name: $0.name, quantity: $0.quantity, unit: $0.unit, baseQuantity: $0.baseQuantity, baseUnit: $0.baseUnit, domain: $0.domain) }
        } else {
            base = cargoPage.map {
                SearchResult(id: $0.id, name: $0.name, quantity: $0.quantity, unit: $0.unit, baseQuantity: $0.baseQuantity, baseUnit: $0.baseUnit, domain: $0.domain)
            }
        }
        guard !names.isEmpty else { return Array(base.prefix(20)) }
        let allowed = Set(cargoPage.filter { matches($0.tags, names) }.map(\.id))
        return Array(base.filter { allowed.contains($0.id) }.prefix(20))
    }

    private var mealRows: [Meal] {
        let names = Array(selectedTags)
        let needle = trimmedQuery.lowercased()
        return meals.filter { meal in
            let nameOK = needle.isEmpty || meal.name.lowercased().contains(needle)
            return nameOK && matches(meal.tags, names)
        }.prefix(20).map { $0 }
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

    private func matches(_ tags: [Tag], _ selected: [String]) -> Bool {
        if selected.isEmpty { return true }
        let names = Set(tags.map(\.name))
        return selected.contains { names.contains($0) }
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
            tagNames: tags.isEmpty ? nil : tags
        )
        do {
            _ = try await env.api.logDiaryFood(body)
            onSaved()
            dismiss()
        } catch {
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
