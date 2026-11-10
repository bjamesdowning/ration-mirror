import AVFoundation
import SwiftUI

/// First dock tab when nutrition-fuel-page is on. Hub stays a toolbar button.
struct FuelView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var day: FuelDayResponse?
    @State private var loaded = false
    @State private var cameraDenied = false
    @State private var showingAdd = false
    @State private var showingPaywall = false
    @State private var showingGoals = false
    @State private var showingBarcodeCamera = false
    @State private var showingScanCamera = false
    @State private var showingTypedBarcode = false
    @State private var name = ""
    @State private var calories = ""
    @State private var editingId: String?
    @State private var barcode = ""
    @State private var message: String?
    @State private var reviewName = ""
    @State private var reviewEnergy = ""
    @State private var photoRequestId: String?
    @State private var photoTask: Task<Void, Never>?
    @State private var zone = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Fuel").rationTitle()
                    Spacer()
                    NavigationLink {
                        MacrosHistoryView(showsNotes: false)
                    } label: {
                        Label("Macros", systemImage: "chart.bar.fill")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("Macros")
                }
                if let day {
                    weekStrip(day)
                    DatePicker(
                        "Jump calendar",
                        selection: jumpDate(day.date),
                        displayedComponents: .date
                    )
                    .datePickerStyle(.compact)
                    .labelsHidden()
                    .accessibilityLabel("Jump calendar")
                    Text(FuelActionPolicy.counterLabel(used: day.used, limit: day.limit))
                        .font(Typography.body())
                        .minimumScaleFactor(0.7)
                        .accessibilityLabel(FuelActionPolicy.counterLabel(used: day.used, limit: day.limit))
                    if day.goal == nil {
                        Button("No goals · Set targets") { showingGoals = true }
                            .frame(minHeight: 44)
                    }
                    Picker("Day layout", selection: layoutBinding(day.diaryLayout)) {
                        Text("Timeline").tag("timeline")
                        Text("Slots").tag("slots")
                    }
                    .pickerStyle(.segmented)
                    if day.fuelTimeZone == nil {
                        TextField("Time zone", text: $zone)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Button("Save time zone") {
                            Task { await saveZone() }
                        }
                        .frame(minHeight: 44)
                    }
                } else if !loaded {
                    ProgressView()
                }
                if !env.network.isOnline {
                    Text("You're offline. Fuel writes, scans, and barcodes stay off until the connection returns.")
                        .rationCaption()
                }
                if let message {
                    Text(message).rationCaption()
                }
                actionButton("Add Fuel", action: .add)
                actionButton("Scan to Fuel", action: .scan)
                actionButton("Barcode to Fuel", action: .barcode)
                if let day {
                    Text(day.diaryLayout == "slots" ? "Slots" : "Timeline")
                        .rationCaption()
                    ForEach(day.items) { item in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(item.name).rationBody()
                                Text("\(Int(item.energyKcal.rounded())) kcal").rationCaption()
                            }
                            Spacer()
                            Button("Edit") { beginEdit(item) }
                                .frame(minWidth: 44, minHeight: 44)
                            Button("Void") { Task { await voidItem(item) } }
                                .frame(minWidth: 44, minHeight: 44)
                        }
                    }
                    if day.items.isEmpty {
                        Text("Nothing logged on this day.").rationCaption()
                    }
                }
                if let photoRequestId, !reviewName.isEmpty {
                    Text(reviewName).rationBody()
                    Button("Confirm meal") { Task { await confirmPhoto() } }
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("fuel.photo.confirm")
                }
            }
            .padding()
        }
        .navigationTitle("Fuel")
        .sheet(isPresented: $showingAdd) { addSheet }
        .sheet(isPresented: $showingPaywall) { PaywallView(context: .settings()) }
        .sheet(isPresented: $showingGoals) { NutritionGoalsView() }
        .sheet(isPresented: $showingBarcodeCamera) {
            FoodBarcodeCapture(code: $barcode) { value in
                barcode = value
                showingBarcodeCamera = false
                Task { await lookupBarcode() }
            }
        }
        .sheet(isPresented: $showingScanCamera) {
            CameraPicker(sourceType: .camera) { image in
                showingScanCamera = false
                guard let image else { return }
                Task { await upload(image) }
            }
        }
        .sheet(isPresented: $showingTypedBarcode) { typedBarcode }
        .task { await reloadAndHandleDeepLink() }
        .onDisappear { photoTask?.cancel() }
    }

    private func weekStrip(_ day: FuelDayResponse) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(day.week, id: \.self) { date in
                    Button(date.suffix(2)) { Task { await load(date: date) } }
                        .frame(minWidth: 44, minHeight: 44)
                        .accessibilityLabel(day.loggedDates.contains(date) ? "\(date) logged" : date)
                }
            }
        }
    }

    private func jumpDate(_ iso: String) -> Binding<Date> {
        Binding(
            get: { LocalDay.date(from: iso) ?? Date() },
            set: { next in
                Task { await load(date: LocalDay.isoString(from: next)) }
            }
        )
    }

    private func layoutBinding(_ current: String) -> Binding<String> {
        Binding(
            get: { current },
            set: { next in Task { await saveLayout(next) } }
        )
    }

    private func actionButton(_ title: String, action: FuelCreateAction) -> some View {
        Button(title) { Task { await perform(action) } }
            .frame(maxWidth: .infinity, minHeight: 44)
            .accessibilityLabel(title)
    }

    private func reloadAndHandleDeepLink() async {
        await refreshCameraAccess()
        await load(date: day?.date ?? LocalDay.todayISO())
        guard loaded, let day else { return }
        if env.deepLinkRouter.fuelGoalsPending {
            showingGoals = true
        }
        if let pending = env.deepLinkRouter.fuelCreatePending {
            await perform(pending, used: day.used, limit: day.limit)
        }
        env.deepLinkRouter.acknowledgeFuel()
    }

    private func refreshCameraAccess() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            cameraDenied = false
        case .notDetermined:
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            cameraDenied = !granted
        default:
            cameraDenied = true
        }
    }

    private func load(date: String) async {
        do {
            day = try await env.api.fuelDay(date: date)
            loaded = true
            message = nil
        } catch {
            loaded = true
            message = "Fuel did not load."
        }
    }

    private func perform(_ action: FuelCreateAction) async {
        guard let day else { return }
        await perform(action, used: day.used, limit: day.limit)
    }

    private func perform(_ action: FuelCreateAction, used: Int, limit: Int?) async {
        if action == .scan || action == .barcode {
            await refreshCameraAccess()
        }
        let decision = FuelActionPolicy.decide(
            action: action,
            used: used,
            limit: limit,
            isOnline: env.network.isOnline,
            cameraDenied: cameraDenied
        )
        switch decision {
        case .openPurchase:
            showingPaywall = true
        case .openForm:
            showingAdd = true
        case .openCamera:
            showingScanCamera = true
        case .cameraOff:
            message = "The camera is off. Scan to Fuel does not upload."
        case .openBarcodeCamera:
            showingBarcodeCamera = true
        case .openTypedBarcode:
            showingTypedBarcode = true
        case .disabledOffline:
            message = "You're offline."
        }
    }

    private var addSheet: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)
                TextField("Calories", text: $calories)
                    .keyboardType(.decimalPad)
                Button("Save") { Task { await saveTyped() } }
                    .frame(minHeight: 44)
            }
            .navigationTitle("Add Fuel")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { showingAdd = false }
                }
            }
        }
    }

    private var typedBarcode: some View {
        NavigationStack {
            Form {
                TextField("Barcode", text: $barcode)
                    .keyboardType(.numberPad)
                Button("Look up") { Task { await lookupBarcode() } }
                    .frame(minHeight: 44)
            }
            .navigationTitle("Barcode to Fuel")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { showingTypedBarcode = false }
                }
            }
        }
    }

    private func saveTyped() async {
        let energy = Double(calories) ?? 0
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let key = UUID().uuidString
        let body = diaryBody(name: name, energy: energy, protein: 0, carbs: 0, fat: 0, key: key, source: "manual_macros")
        do {
            if let editingId {
                _ = try await env.api.updateDiaryFood(id: editingId, body: body)
            } else {
                _ = try await env.api.logDiaryFood(body)
            }
            showingAdd = false
            self.editingId = nil
            name = ""
            calories = ""
            await load(date: day?.date ?? LocalDay.todayISO())
        } catch {
            await handleWrite(error)
        }
    }

    private func beginEdit(_ item: FuelDayResponse.Item) {
        editingId = item.id
        name = item.name
        calories = String(Int(item.energyKcal.rounded()))
        showingAdd = true
    }

    private func voidItem(_ item: FuelDayResponse.Item) async {
        do {
            _ = try await env.api.voidDiaryFood(
                id: item.id,
                body: DiaryVoidBody(confirm: true, operationKey: UUID().uuidString)
            )
            await load(date: day?.date ?? LocalDay.todayISO())
        } catch {
            await handleWrite(error)
        }
    }

    private func lookupBarcode() async {
        guard let day else { return }
        let decision = FuelActionPolicy.decide(
            action: .barcode,
            used: day.used,
            limit: day.limit,
            isOnline: env.network.isOnline,
            cameraDenied: cameraDenied
        )
        if decision == .openPurchase {
            showingPaywall = true
            return
        }
        do {
            let result = try await env.api.lookupFoodBarcode(barcode)
            showingTypedBarcode = false
            guard result.found == true, let foundName = result.name, let macros = result.macros else {
                message = "No food matched that barcode."
                return
            }
            let key = UUID().uuidString
            _ = try await env.api.logDiaryFood(
                diaryBody(
                    name: foundName,
                    energy: macros.energyKcal,
                    protein: macros.proteinG,
                    carbs: macros.carbsG,
                    fat: macros.fatG,
                    key: key,
                    source: "usda"
                )
            )
            await load(date: day.date)
        } catch {
            await handleWrite(error)
        }
    }

    private func upload(_ image: UIImage) async {
        guard let day else { return }
        if FuelActionPolicy.decide(
            action: .scan,
            used: day.used,
            limit: day.limit,
            isOnline: env.network.isOnline,
            cameraDenied: cameraDenied
        ) == .openPurchase {
            showingPaywall = true
            return
        }
        guard let jpeg = image.jpegData(compressionQuality: 0.7) else { return }
        photoTask?.cancel()
        photoTask = Task {
            do {
                let queued = try await env.api.submitFuelPhoto(
                    FuelPhotoSubmitBody(
                        operationKey: UUID().uuidString,
                        contentType: "image/jpeg",
                        imageBase64: jpeg.base64EncodedString()
                    )
                )
                let status = try await poll(queued.requestId)
                if Task.isCancelled { return }
                guard status.status == "ready_to_review", let lines = status.lines, !lines.isEmpty else {
                    message = "Photo status: \(status.status)."
                    return
                }
                photoRequestId = queued.requestId
                reviewName = lines.map { $0.name ?? "Food" }.joined(separator: ", ")
                reviewEnergy = String(lines.reduce(0) { $0 + ($1.energyKcal ?? 0) })
            } catch is CancellationError {
                return
            } catch {
                await handleWrite(error)
            }
        }
    }

    private func poll(_ requestId: String) async throws -> FuelPhotoStatusResponse {
        var last = FuelPhotoStatusResponse(requestId: requestId, status: "queued", lines: nil)
        for attempt in 1...40 {
            try Task.checkCancellation()
            let milliseconds: UInt64 = attempt == 1 ? 1_500 : 3_000
            try await Task.sleep(nanoseconds: milliseconds * 1_000_000)
            try Task.checkCancellation()
            last = try await env.api.fuelPhotoStatus(requestId)
            if last.status == "ready_to_review" || last.status == "failed" || last.status == "expired" {
                return last
            }
        }
        return last
    }

    private func confirmPhoto() async {
        guard let photoRequestId, let energy = Double(reviewEnergy) else { return }
        let key = UUID().uuidString
        do {
            _ = try await env.api.confirmFuelPhoto(
                requestId: photoRequestId,
                body: diaryBody(
                    name: reviewName,
                    energy: energy,
                    protein: 0,
                    carbs: 0,
                    fat: 0,
                    key: key,
                    source: "ai_estimate"
                )
            )
            self.photoRequestId = nil
            reviewName = ""
            await load(date: day?.date ?? LocalDay.todayISO())
        } catch {
            await handleWrite(error)
        }
    }

    private func saveLayout(_ layout: String) async {
        do {
            _ = try await env.api.patchSettings(SettingsPatch(diaryLayout: layout))
            await load(date: day?.date ?? LocalDay.todayISO())
        } catch {
            message = "Day layout was not saved."
        }
    }

    private func saveZone() async {
        let trimmed = zone.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        do {
            _ = try await env.api.patchSettings(SettingsPatch(fuelTimeZone: trimmed))
            await load(date: day?.date ?? LocalDay.todayISO())
        } catch {
            message = "Set a time zone before logging."
        }
    }

    private func diaryBody(
        name: String,
        energy: Double,
        protein: Double,
        carbs: Double,
        fat: Double,
        key: String,
        source: String
    ) -> DiaryFoodBody {
        DiaryFoodBody(
            name: name,
            occurredAt: ISO8601DateFormatter().string(from: Date()),
            amount: 1,
            unit: "serving",
            macros: DiaryMacrosBody(energyKcal: energy, proteinG: protein, carbsG: carbs, fatG: fat),
            idempotencyKey: key,
            operationKey: key,
            compositionSource: source
        )
    }

    private func handleWrite(_ error: Error) async {
        let code = (error as? APIError)?.code
        if code == "fuel_daily_limit" {
            showingAdd = false
            showingPaywall = true
        } else {
            message = "That log was not saved."
        }
    }
}
