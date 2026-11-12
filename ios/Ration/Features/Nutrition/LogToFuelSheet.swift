import SwiftUI
import UIKit
import VisionKit

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

/// Type, recent, and amount. Shutter and barcode follow their child flags.
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
    @State private var saved: [SavedFoodRow] = []
    @State private var savedFoodId: String?
    @State private var errorMessage: String?
    @State private var saving = false
    @State private var barcodeCode = ""
    @State private var showScanner = false
    @State private var showCamera = false
    @State private var photoRef = ""
    @State private var compositionSource: String?

    private var savedFoodsVisible: Bool {
        SavedFoodPolicy.controlVisible(
            fastLogEnabled: env.session.clientFlags.isNutritionFastLogEnabled,
            savedFoodEnabled: env.session.clientFlags.isNutritionSavedFoodEnabled,
            appVersion: AppMarketingVersion.current
        )
    }

    private var shutterEnabled: Bool {
        FuelLogInputPolicy.shutterEnabled(
            fastLogEnabled: env.session.clientFlags.isNutritionFastLogEnabled,
            photoLogEnabled: env.session.clientFlags.isNutritionPhotoLogEnabled,
            appVersion: AppMarketingVersion.current
        )
    }

    private var barcodeEnabled: Bool {
        FuelLogInputPolicy.barcodeEnabled(
            fastLogEnabled: env.session.clientFlags.isNutritionFastLogEnabled,
            barcodeLogEnabled: env.session.clientFlags.isNutritionBarcodeDiaryEnabled,
            appVersion: AppMarketingVersion.current
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("This records what you ate. It does not change Cargo.")
                        .rationCaption()
                    if shutterEnabled {
                        Button("Photo") { showCamera = true }
                            .disabled(saving)
                    }
                    if barcodeEnabled {
                        Button("Barcode") { showScanner = true }
                            .disabled(saving)
                    }
                    if shutterEnabled || barcodeEnabled {
                        Text("A photo or barcode fills this draft. It is not logged until you save.")
                            .rationCaption()
                            .foregroundStyle(Theme.muted)
                    }
                }
                if savedFoodsVisible && !saved.isEmpty {
                    Section("Saved") {
                        ForEach(saved) { food in
                            Button(food.name) { applySaved(food) }
                        }
                    }
                }
                if !recent.isEmpty {
                    Section("Recent") {
                        ForEach(recent) { food in
                            HStack {
                                Button(food.name) { apply(food) }
                                if savedFoodsVisible {
                                    Button("Star") { Task { await star(food) } }
                                        .accessibilityLabel("Star \(food.name)")
                                }
                            }
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
                if savedFoodsVisible && savedFoodId == nil {
                    Button("Save this food") { Task { await starDraft() } }
                        .disabled(saving)
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
            .task {
                await loadRecent()
                await loadSaved()
            }
            .onAppear(perform: prefill)
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker { image in
                    showCamera = false
                    guard let image, let encoded = FuelPhoto.jpegBase64(image) else { return }
                    photoRef = encoded
                    Task { await proposePhoto() }
                }
                .ignoresSafeArea()
            }
            .sheet(isPresented: $showScanner) {
                FoodBarcodeCapture(code: $barcodeCode) { code in
                    showScanner = false
                    barcodeCode = code
                    Task { await lookupBarcode() }
                }
            }
        }
    }

    /// Editable amount. Servings stay fractional; the digits come from the presenter formatter.
    private func amountText(_ value: Double, unit: String) -> String {
        QuantityPresentation.formatNumber(value, unit: unit, wholeCounts: false)
    }

    private func prefill() {
        guard let existing else { return }
        name = existing.name
        amount = amountText(existing.amount, unit: existing.unit)
        unit = existing.unit
        energy = String(existing.energyKcal)
        protein = String(existing.proteinG)
        carbs = String(existing.carbsG)
        fat = String(existing.fatG)
        occurredAt = existing.occurredAt
    }

    private func apply(_ food: RecentFuelFood) {
        savedFoodId = nil
        name = food.name
        amount = amountText(food.amount, unit: food.unit)
        unit = food.unit
        energy = String(food.energyKcal)
        protein = String(food.proteinG)
        carbs = String(food.carbsG)
        fat = String(food.fatG)
    }

    private func applySaved(_ food: SavedFoodRow) {
        savedFoodId = food.id
        name = food.name
        let savedUnit = food.defaultUnit ?? "serving"
        amount = amountText(food.defaultAmount ?? 1, unit: savedUnit)
        unit = savedUnit
        energy = String(food.energyKcal)
        protein = String(food.proteinG)
        carbs = String(food.carbsG)
        fat = String(food.fatG)
    }

    private func loadSaved() async {
        guard savedFoodsVisible else {
            saved = []
            return
        }
        saved = (try? await env.api.listSavedFoods())?.savedFoods ?? []
    }

    private func lookupBarcode() async {
        guard barcodeEnabled else { return }
        do {
            let result = try await env.api.lookupFoodBarcode(barcodeCode)
            if result.found == true, let foundName = result.name {
                name = foundName
                if let macros = result.macros {
                    energy = String(macros.energyKcal)
                    protein = String(macros.proteinG)
                    carbs = String(macros.carbsG)
                    fat = String(macros.fatG)
                }
                compositionSource = "usda"
            }
        } catch {
            errorMessage = "Could not look up that barcode."
        }
    }

    private func proposePhoto() async {
        guard shutterEnabled, !photoRef.isEmpty else { return }
        do {
            let result = try await env.api.proposeFoodLog(
                photoRef: photoRef,
                operationKey: operationKey,
                subject: "custom",
                barcode: nil
            )
            if let line = result.lines.first {
                name = line.name
                energy = String(line.energyKcal)
                protein = String(line.proteinG)
                carbs = String(line.carbsG)
                fat = String(line.fatG)
                compositionSource = "ai_estimate"
            }
        } catch {
            errorMessage = "Could not read that photo."
        }
    }

    private func star(_ food: RecentFuelFood) async {
        await storeFood(
            name: food.name,
            amount: food.amount,
            unit: food.unit,
            energy: food.energyKcal,
            protein: food.proteinG,
            carbs: food.carbsG,
            fat: food.fatG
        )
    }

    private func starDraft() async {
        guard let amountValue = Double(amount),
              let energyValue = Double(energy),
              let proteinValue = Double(protein),
              let carbsValue = Double(carbs),
              let fatValue = Double(fat) else {
            errorMessage = "Enter a name, amount, and macros before saving the food."
            return
        }
        await storeFood(
            name: name.trimmingCharacters(in: .whitespaces),
            amount: amountValue,
            unit: unit,
            energy: energyValue,
            protein: proteinValue,
            carbs: carbsValue,
            fat: fatValue
        )
    }

    private func storeFood(
        name: String,
        amount: Double,
        unit: String,
        energy: Double,
        protein: Double,
        carbs: Double,
        fat: Double
    ) async {
        guard !name.isEmpty, amount > 0 else {
            errorMessage = "Add a name and an amount."
            return
        }
        saving = true
        errorMessage = nil
        do {
            _ = try await env.api.saveFood(
                SaveFoodBody(
                    name: name,
                    amount: amount,
                    unit: unit,
                    macros: DiaryMacrosBody(
                        energyKcal: energy,
                        proteinG: protein,
                        carbsG: carbs,
                        fatG: fat
                    )
                )
            )
            await loadSaved()
            saving = false
        } catch {
            saving = false
            errorMessage = FuelDeviceZone.message(for: error) ?? error.localizedDescription
        }
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
            operationKey: operationKey,
            compositionSource: compositionSource
        )
        do {
            if let existing {
                _ = try await env.api.updateDiaryFood(id: existing.id, body: body)
            } else if let savedFoodId {
                _ = try await env.api.logSavedFood(
                    SavedFoodLogBody(
                        savedFoodId: savedFoodId,
                        occurredAt: FuelTime.isoString(occurredAt),
                        idempotencyKey: idempotencyKey,
                        operationKey: operationKey
                    )
                )
            } else {
                _ = try await env.api.logDiaryFood(body)
            }
            saving = false
            onSaved()
            onClose()
        } catch {
            saving = false
            errorMessage = FuelDeviceZone.message(for: error) ?? error.localizedDescription
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
            errorMessage = FuelDeviceZone.message(for: error) ?? error.localizedDescription
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

/// JPEG bytes for a food-log draft. No data-URL prefix. Not an intake until Save.
enum FuelPhoto {
    static func jpegBase64(_ image: UIImage, maxSide: CGFloat = 1280, quality: CGFloat = 0.7) -> String? {
        let size = image.size
        guard size.width > 0, size.height > 0 else { return nil }
        let scale = min(1, maxSide / max(size.width, size.height))
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        return rendered.jpegData(compressionQuality: quality)?.base64EncodedString()
    }
}

/// Camera barcode scan, with a typed code when the scanner is unavailable.
struct FoodBarcodeCapture: View {
    @Binding var code: String
    var onCode: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                    FoodBarcodeScanner { value in
                        onCode(value)
                    }
                } else {
                    Form {
                        TextField("Code", text: $code)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                }
            }
            .navigationTitle("Barcode")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                if !(DataScannerViewController.isSupported && DataScannerViewController.isAvailable) {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Look up") { onCode(code) }
                            .disabled(code.trimmingCharacters(in: .whitespaces).count < 4)
                    }
                }
            }
        }
    }
}

private struct FoodBarcodeScanner: UIViewControllerRepresentable {
    var onCode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode()],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        guard DataScannerViewController.isSupported, DataScannerViewController.isAvailable else { return }
        if !scanner.isScanning {
            try? scanner.startScanning()
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onCode: onCode)
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        private var delivered = false

        init(onCode: @escaping (String) -> Void) {
            self.onCode = onCode
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didAdd addedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            guard !delivered else { return }
            for item in addedItems {
                guard case .barcode(let barcode) = item,
                      let value = barcode.payloadStringValue,
                      !value.isEmpty
                else { continue }
                delivered = true
                onCode(value)
                return
            }
        }
    }
}
