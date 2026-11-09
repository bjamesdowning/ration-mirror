import SwiftUI

struct LogToFuelExisting: Identifiable, Equatable {
    let id: String
    var name: String
    var amount: Double
    var unit: String
    var energyKcal: Double
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    var occurredAt: Date
}

struct RecentFuelFood: Identifiable, Equatable {
    var id: String { name }
    let name: String
    let amount: Double
    let unit: String
    let energyKcal: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
}

/// Type, recent, and amount. Shutter and barcode stay disabled.
struct LogToFuelSheet: View {
    @Environment(AppEnvironment.self) private var env
    var existing: LogToFuelExisting?
    var onClose: () -> Void
    var onSaved: () -> Void

    @State private var name = ""
    @State private var amount = "1"
    @State private var unit = "serving"
    @State private var energy = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""
    @State private var occurredAt = Date()
    @State private var operationKey = LogToFuelDraft.operationKey(existing: nil, mint: { UUID().uuidString })
    @State private var idempotencyKey = UUID().uuidString
    @State private var recent: [RecentFuelFood] = []
    @State private var errorMessage: String?
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("This records what you ate. It does not change Cargo.")
                        .rationCaption()
                    HStack {
                        Button("Shutter") {}
                            .disabled(true)
                        Button("Barcode") {}
                            .disabled(true)
                    }
                }
                if !recent.isEmpty {
                    Section("Recent") {
                        ForEach(recent) { food in
                            Button(food.name) { apply(food) }
                        }
                    }
                }
                Section("Food") {
                    TextField("Name", text: $name)
                    TextField("Amount", text: $amount)
                        .keyboardType(.decimalPad)
                    Picker("Unit", selection: $unit) {
                        Text("serving").tag("serving")
                        Text("g").tag("g")
                        Text("oz").tag("oz")
                    }
                    DatePicker("Time", selection: $occurredAt)
                }
                Section("Macros") {
                    TextField("kcal", text: $energy).keyboardType(.decimalPad)
                    TextField("Protein g", text: $protein).keyboardType(.decimalPad)
                    TextField("Carbs g", text: $carbs).keyboardType(.decimalPad)
                    TextField("Fat g", text: $fat).keyboardType(.decimalPad)
                }
                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                }
                if existing != nil {
                    Button("Remove my log", role: .destructive) {
                        Task { await voidLog() }
                    }
                    .disabled(saving)
                }
            }
            .navigationTitle("Log to Fuel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onClose)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(saving)
                }
            }
            .task { await loadRecent() }
            .onAppear(perform: prefill)
        }
    }

    private func prefill() {
        guard let existing else { return }
        name = existing.name
        amount = String(existing.amount)
        unit = existing.unit
        energy = String(existing.energyKcal)
        protein = String(existing.proteinG)
        carbs = String(existing.carbsG)
        fat = String(existing.fatG)
        occurredAt = existing.occurredAt
    }

    private func apply(_ food: RecentFuelFood) {
        name = food.name
        amount = String(food.amount)
        unit = food.unit
        energy = String(food.energyKcal)
        protein = String(food.proteinG)
        carbs = String(food.carbsG)
        fat = String(food.fatG)
    }

    private func loadRecent() async {
        guard let export = try? await env.api.exportDiaryFood() else { return }
        var foods: [RecentFuelFood] = []
        var seen = Set<String>()
        for row in export.intakes.reversed() {
            if row.voidedAt != nil || row.name == nil || seen.contains(row.name ?? "") { continue }
            let foodName = row.name ?? ""
            seen.insert(foodName)
            foods.append(
                RecentFuelFood(
                    name: foodName,
                    amount: row.loggedAmount ?? row.servings,
                    unit: row.loggedUnit ?? "serving",
                    energyKcal: row.energyKcal,
                    proteinG: row.proteinG,
                    carbsG: row.carbsG,
                    fatG: row.fatG
                )
            )
            if foods.count == 8 { break }
        }
        recent = foods
    }

    private func save() async {
        guard let amountValue = Double(amount), amountValue > 0, !name.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorMessage = "Add a name and an amount."
            return
        }
        guard let energyValue = Double(energy),
              let proteinValue = Double(protein),
              let carbsValue = Double(carbs),
              let fatValue = Double(fat),
              energyValue >= 0, proteinValue >= 0, carbsValue >= 0, fatValue >= 0 else {
            errorMessage = "Enter kcal, protein, carbs, and fat."
            return
        }
        saving = true
        errorMessage = nil
        let body = DiaryFoodBody(
            name: name.trimmingCharacters(in: .whitespaces),
            occurredAt: FuelTime.isoString(occurredAt),
            amount: amountValue,
            unit: unit,
            macros: DiaryMacrosBody(
                energyKcal: energyValue,
                proteinG: proteinValue,
                carbsG: carbsValue,
                fatG: fatValue
            ),
            idempotencyKey: idempotencyKey,
            operationKey: operationKey
        )
        do {
            if let existing {
                _ = try await env.api.updateDiaryFood(id: existing.id, body: body)
            } else {
                _ = try await env.api.logDiaryFood(body)
            }
            saving = false
            onSaved()
            onClose()
        } catch {
            saving = false
            errorMessage = error.localizedDescription
        }
    }

    private func voidLog() async {
        guard let existing else { return }
        saving = true
        errorMessage = nil
        do {
            _ = try await env.api.voidDiaryFood(
                id: existing.id,
                body: DiaryVoidBody(confirm: true, operationKey: operationKey)
            )
            saving = false
            onSaved()
            onClose()
        } catch {
            saving = false
            errorMessage = error.localizedDescription
        }
    }
}

enum FuelTime {
    static func isoString(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    static func date(from iso: String?) -> Date {
        guard let iso else { return Date() }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: iso) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: iso) ?? Date()
    }

    static func clock(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }
}
