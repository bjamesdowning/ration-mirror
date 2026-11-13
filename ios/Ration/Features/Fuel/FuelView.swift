import AVFoundation
import SwiftUI

/// First dock tab when nutrition-fuel-page is on. Hub stays a toolbar button.
struct FuelView: View {
    @Environment(AppEnvironment.self) private var env
    var onOpenSettings: () -> Void = {}
    var fuelDockActive = false
    @State private var showingMacros = false
    @State private var day: FuelDayResponse?
    @State private var loaded = false
    @State private var cameraDenied = false
    @State private var showingAdd = false
    @State private var showingPaywall = false
    @State private var showingGoals = false
    @State private var showingBarcodeCamera = false
    @State private var showingScanCamera = false
    @State private var showingScanIntro = false
    @State private var showingCreditPaywall = false
    @State private var consent = AIConsentCoordinator()
    @State private var photoFailed = false
    @State private var showingTypedBarcode = false
    @State private var name = ""
    @State private var calories = ""
    @State private var editingDraft: FuelLogWrite?
    @State private var path: [FuelLogRoute] = []
    @State private var barcode = ""
    @State private var message: String?
    @State private var reviewName = ""
    @State private var reviewAmount = "1"
    @State private var reviewUnit = "serving"
    @State private var reviewEnergy = ""
    @State private var reviewProtein = ""
    @State private var reviewCarbs = ""
    @State private var reviewFat = ""
    @State private var photoRequestId: String?
    @State private var photoTask: Task<Void, Never>?
    @State private var generation = 0
    @State private var removedIds: Set<String> = []
    @State private var voidingIds: Set<String> = []
    @State private var failedTarget: String?
    @State private var showingCalendar = false
    @State private var isNavigating = false
    var body: some View {
        NavigationStack(path: $path) {
        List {
            if loaded, let day {
                ListCountHeader(text: FuelActionPolicy.counterLabel(used: day.used, limit: day.limit))
                fuelRocker(day)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
            Section {
                VStack(alignment: .leading, spacing: 16) {
                    if let day {
                        FuelDaySummary(model: summary(for: day)) { showingGoals = true }
                    } else if !loaded {
                        ProgressView()
                    }
                    if !env.network.isOnline {
                        Text("You're offline. Fuel writes, scans, and barcodes stay off until the connection returns.")
                            .rationCaption()
                    }
                    if message == "Fuel did not load." {
                        Text(message ?? "")
                            .rationCaption()
                        Button("Retry") {
                            Task { await load(date: failedTarget ?? day?.date ?? LocalDay.todayISO()) }
                        }
                        .frame(minHeight: 44)
                    } else if let message {
                        Text(message).rationCaption()
                    }
                    if photoFailed {
                        Button("Try again") {
                            photoFailed = false
                            message = nil
                            showingScanIntro = true
                        }
                        .frame(minHeight: 44)
                    }
                    if let photoRequestId, !reviewName.isEmpty {
                        Text("Estimate").rationCaption()
                        TextField("Name", text: $reviewName)
                        TextField("Amount", text: $reviewAmount)
                            .keyboardType(.decimalPad)
                        TextField("Unit", text: $reviewUnit)
                        TextField("Calories", text: $reviewEnergy)
                            .keyboardType(.decimalPad)
                        TextField("Protein", text: $reviewProtein)
                            .keyboardType(.decimalPad)
                        TextField("Carbs", text: $reviewCarbs)
                            .keyboardType(.decimalPad)
                        TextField("Fat", text: $reviewFat)
                            .keyboardType(.decimalPad)
                        Button("Approve") { Task { await confirmPhoto() } }
                            .frame(minHeight: 44)
                            .accessibilityIdentifier("fuel.photo.confirm")
                    }
                }
                .buttonStyle(.borderless)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
            if let day {
                Section {
                    ForEach(day.items) { item in
                        NavigationLink(value: FuelLogRoute(id: item.id)) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.name).rationBody()
                                Text("\(Int(item.energyKcal.rounded())) kcal").rationCaption()
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 4)
                        }
                        .fuelLogSwipeActions(
                            onEdit: { editingDraft = .editing(item) },
                            onDelete: { Task { await voidItem(item) } }
                        )
                    }
                    if day.items.isEmpty {
                        Text("Nothing logged on this day.").rationCaption()
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .copilotDockScrollMargins()
        .navigationTitle("Fuel")
        .rationLargeTitle()
        .ceramicPageChrome()
        .toolbar {
            GlobalPageToolbar(
                accessories: [
                    PageCapsuleAccessory(
                        id: "macros",
                        systemImage: "chart.bar.fill",
                        label: "Macros",
                        action: { showingMacros = true }
                    )
                ],
                trailingAccessories: todayAccessory,
                onOpenSettings: onOpenSettings
            )
        }
        .navigationDestination(for: FuelLogRoute.self) { route in
            if let item = day?.items.first(where: { $0.id == route.id }) {
                FuelLogDetailView(
                    item: item,
                    onEdit: { editingDraft = .editing(item) },
                    onDelete: {
                        path.removeAll()
                        Task { await voidItem(item) }
                    }
                )
            } else {
                Color.clear
                    .onAppear {
                        path.removeAll { $0.id == route.id }
                    }
            }
        }
        .navigationDestination(isPresented: $showingMacros) {
            MacrosHistoryView(onOpenGoals: { showingGoals = true }, showsNotes: false)
        }
        .tabDockAction(
            tag: .hub,
            isActive: fuelDockActive && !showingMacros && path.isEmpty
        ) {
            IconFABMenuCore(systemImage: "plus.circle.fill", accessibilityLabel: "Fuel actions") {
                ForEach(FuelCreateAction.allCases, id: \.self) { action in
                    Button(FuelMenuCopy.label(for: action), systemImage: FuelMenuCopy.systemImage(for: action)) {
                        Task { await perform(action) }
                    }
                }
            }
        }
        .sheet(isPresented: $showingAdd) { addSheet }
        .sheet(item: $editingDraft) { draft in
            FuelLogEditSheet(draft: draft) { next in
                Task { await saveEdit(next) }
            }
        }
        .sheet(isPresented: $showingCalendar) {
            ManifestJumpCalendarSheet(
                initialDay: day?.date ?? LocalDay.todayISO(),
                todayProvider: { LocalDay.todayISO() },
                loadMarkers: { from, to in
                    let response = try await env.api.manifestPlannedDates(
                        from: from,
                        to: to,
                        intake: "fuel"
                    )
                    return (response.dates, response.consumedDates ?? [])
                },
                onSelect: { isoDay in
                    Task { await load(date: isoDay) }
                }
            )
        }
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
        .sheet(isPresented: $showingScanIntro) { scanIntro }
        .sheet(isPresented: $showingCreditPaywall) { PaywallView(context: .credits()) }
        .sheet(isPresented: Binding(
            get: { consent.isPresenting },
            set: { if !$0 { consent.decline() } }
        )) {
            AIConsentGateView(
                errorMessage: consent.errorMessage,
                isAccepting: consent.isAccepting,
                onAccept: { Task { await consent.accept(api: env.api, session: env.session) } },
                onDecline: { consent.decline() }
            )
        }
        .sheet(isPresented: $showingTypedBarcode) { typedBarcode }
        .task { await reloadAndHandleDeepLink() }
        .onChange(of: env.deepLinkRouter.fuelGoalsPending) { _, pending in
            if pending { Task { await reloadAndHandleDeepLink() } }
        }
        .onChange(of: env.deepLinkRouter.fuelCreatePending) { _, pending in
            if pending != nil { Task { await reloadAndHandleDeepLink() } }
        }
        .onDisappear { photoTask?.cancel() }
        }
    }

    private var todayAccessory: [PageCapsuleAccessory] {
        guard env.session.clientFlags.isNutritionFuelPageEnabled else { return [] }
        let showingToday = day?.date == LocalDay.todayISO()
        return [
            PageCapsuleAccessory(
                id: "today",
                systemImage: "calendar",
                label: "Today",
                hint: showingToday ? nil : "Jump to today",
                value: showingToday ? "Showing today" : nil,
                isEnabled: !showingToday && !isNavigating,
                action: { Task { await load(date: LocalDay.todayISO()) } }
            )
        ]
    }

    private func summary(for day: FuelDayResponse) -> FuelDaySummaryModel {
        FuelDaySummaryModel.make(
            energyKcal: day.totals?.energyKcal ?? 0,
            proteinG: day.totals?.proteinG ?? 0,
            carbsG: day.totals?.carbsG ?? 0,
            fatG: day.totals?.fatG ?? 0,
            fiberG: day.totals?.fiberG,
            goal: day.goal.map {
                NutritionSummary.Goal(
                    dailyEnergyKcal: $0.dailyEnergyKcal,
                    proteinG: $0.proteinG,
                    carbsG: $0.carbsG,
                    fatG: $0.fatG,
                    fiberG: $0.fiberG,
                    effectiveFrom: day.date,
                    effectiveTo: nil
                )
            }
        )
    }

    private func fuelRocker(_ day: FuelDayResponse) -> some View {
        let label = ManifestDateHelpers.formatRange(start: day.date, end: day.date)
        return HStack(spacing: 0) {
            Button { Task { await step(day, by: -1) } } label: {
                DateRockerChevron(systemName: "chevron.left", isEnabled: !isNavigating)
            }
            .accessibilityLabel("Previous day")
            .disabled(isNavigating)
            Button { showingCalendar = true } label: {
                DateRockerLabel(text: label)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .accessibilityLabel(label)
            .accessibilityHint("Opens calendar to jump to a date")
            Button { Task { await step(day, by: 1) } } label: {
                DateRockerChevron(systemName: "chevron.right", isEnabled: !isNavigating)
            }
            .accessibilityLabel("Next day")
            .disabled(isNavigating)
        }
        .buttonStyle(.borderless)
    }

    private func step(_ day: FuelDayResponse, by days: Int) async {
        await load(date: LocalDay.addDays(day.date, days: days))
    }

    private func reloadAndHandleDeepLink() async {
        readCameraStatus()
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

    private func readCameraStatus() {
        cameraDenied = AVCaptureDevice.authorizationStatus(for: .video) != .authorized
    }

    private func ensureCameraAccess() async {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        if status == .notDetermined {
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            cameraDenied = !granted
        } else {
            cameraDenied = status != .authorized
        }
    }

    private func load(date: String) async {
        generation += 1
        let token = generation
        isNavigating = true
        defer {
            if token == generation { isNavigating = false }
        }
        do {
            var next = try await env.api.fuelDay(date: date)
            guard token == generation else { return }
            let hidden = next.items.filter { removedIds.contains($0.id) }
            if !hidden.isEmpty {
                next.items.removeAll { removedIds.contains($0.id) }
                next.used = min(next.used, max(0, next.used - hidden.count))
            }
            day = next
            loaded = true
            failedTarget = nil
            message = nil
        } catch {
            guard token == generation else { return }
            loaded = true
            failedTarget = date
            message = "Fuel did not load."
        }
    }

    private func perform(_ action: FuelCreateAction) async {
        let today = LocalDay.todayISO()
        if FuelMenuRouting.needsTodayLoad(loadedDate: day?.date, today: today) {
            await load(date: today)
        }
        guard let day, FuelMenuRouting.canOpen(loadedDate: day.date, today: today) else {
            return
        }
        await perform(action, used: day.used, limit: day.limit)
    }

    private func perform(_ action: FuelCreateAction, used: Int, limit: Int?) async {
        let photoLogEnabled = env.session.clientFlags.isNutritionPhotoLogEnabled
        if action == .barcode || (action == .scan && photoLogEnabled) {
            await ensureCameraAccess()
        }
        let decision = FuelActionPolicy.decide(
            action: action,
            used: used,
            limit: limit,
            isOnline: env.network.isOnline,
            cameraDenied: cameraDenied,
            photoLogEnabled: photoLogEnabled
        )
        switch decision {
        case .disabledOffline:
            message = "You're offline."
        case .openPurchase:
            showingPaywall = true
        case .photoLogOff:
            message = "Photo food log is unavailable."
        case .cameraOff:
            message = "The camera is off. Scan to Fuel does not upload."
        case .openForm, .openCamera, .openBarcodeCamera, .openTypedBarcode:
            guard FuelDeviceZone.candidate != nil else {
                message = FuelDeviceZone.unusableMessage
                return
            }
            switch decision {
            case .openForm:
                showingAdd = true
            case .openCamera:
                showingScanIntro = true
            case .openBarcodeCamera:
                showingBarcodeCamera = true
            case .openTypedBarcode:
                showingTypedBarcode = true
            default:
                break
            }
        }
    }

    private var scanCreditCost: Int {
        env.session.session?.aiCosts?.scan ?? 2
    }

    private var scanIntro: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    AIFeatureInlineIntro(
                        title: "Scan to Fuel",
                        detail: "A plate, a set of ingredients, one item, or a drink. The estimate is from what is visible.",
                        creditCost: scanCreditCost,
                        costLabel: "per photo",
                        nextSteps: "Approve is the write. This is not medical advice.",
                        hint: AIFeatureInlineIntro.nutritionHint
                    )
                    AIFeaturePrimaryButton(label: "Open camera", creditCost: scanCreditCost) {
                        consent.presentIfNeeded(session: env.session) {
                            showingScanIntro = false
                            showingScanCamera = true
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            .navigationTitle("Scan to Fuel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { showingScanIntro = false }
                }
            }
            .background(Theme.ceramic)
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
            _ = try await env.api.logDiaryFood(body)
            showingAdd = false
            name = ""
            calories = ""
            await load(date: day?.date ?? LocalDay.todayISO())
        } catch {
            await handleWrite(error)
        }
    }

    private func saveEdit(_ draft: FuelLogWrite) async {
        let key = UUID().uuidString
        do {
            _ = try await env.api.updateDiaryFood(id: draft.id, body: draft.body(key: key))
            editingDraft = nil
            await load(date: day?.date ?? LocalDay.todayISO())
        } catch {
            await handleWrite(error)
        }
    }

    private func voidItem(_ item: FuelDayResponse.Item) async {
        guard voidingIds.insert(item.id).inserted else { return }
        defer { voidingIds.remove(item.id) }
        let decision: FuelVoidDecision
        do {
            let saved = try await env.api.voidDiaryFood(
                id: item.id,
                body: DiaryVoidBody(confirm: true, operationKey: UUID().uuidString)
            )
            decision = FuelVoidResolution.decide(intakeId: saved.intakeId)
        } catch {
            decision = FuelVoidResolution.decide(error)
        }
        switch decision {
        case .remove:
            acceptVoid(item)
        case .keep(let message):
            self.message = message
        case .paywall:
            showingAdd = false
            editingDraft = nil
            showingPaywall = true
        }
    }

    private func acceptVoid(_ item: FuelDayResponse.Item) {
        removedIds.insert(item.id)
        path.removeAll { $0.id == item.id }
        if var current = day {
            let had = current.items.contains { $0.id == item.id }
            current.items.removeAll { $0.id == item.id }
            if had { current.used = max(0, current.used - 1) }
            day = current
        }
        if itemHasPlanLine(item) {
            env.notifyManifestDataChanged()
        }
        Task { await load(date: day?.date ?? LocalDay.todayISO()) }
    }

    private func itemHasPlanLine(_ item: FuelDayResponse.Item) -> Bool {
        if let entryId = item.entryId, !entryId.isEmpty { return true }
        return false
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
        let jpeg: Data?
        do {
            jpeg = try await ScanImageProcessor.resizedJPEG(from: image)
        } catch is CancellationError {
            return
        } catch {
            message = "That photo was not queued."
            photoFailed = true
            return
        }
        guard let jpeg else { return }
        if jpeg.count > 3 * 1024 * 1024 {
            message = "Photo must be 3 MiB or smaller."
            photoFailed = true
            return
        }
        photoFailed = false
        message = "Queued"
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
                reviewAmount = String(lines.first?.amount ?? 1)
                reviewUnit = lines.first?.unit ?? "serving"
                reviewEnergy = String(lines.reduce(0) { $0 + ($1.energyKcal ?? 0) })
                reviewProtein = String(lines.reduce(0) { $0 + ($1.proteinG ?? 0) })
                reviewCarbs = String(lines.reduce(0) { $0 + ($1.carbsG ?? 0) })
                reviewFat = String(lines.reduce(0) { $0 + ($1.fatG ?? 0) })
            } catch is CancellationError {
                return
            } catch {
                await MainActor.run { handlePhoto(error) }
            }
        var last = FuelPhotoStatusResponse(requestId: requestId, status: "queued", lines: nil)
        for attempt in 1...40 {
            try Task.checkCancellation()
            let milliseconds: UInt64 = attempt == 1 ? 1_500 : 3_000
            try await Task.sleep(nanoseconds: milliseconds * 1_000_000)
            try Task.checkCancellation()
            last = try await env.api.fuelPhotoStatus(requestId)
            if last.status == "queued" { message = "Queued" }
            if last.status == "processing" { message = "Analyzing" }
            if last.status == "failed" {
                message = "That photo was not queued."
                photoFailed = true
            }
            if last.status == "ready_to_review" || last.status == "failed" || last.status == "expired" {
                return last
            }
        }
        return last
    }

    private func confirmPhoto() async {
        guard let photoRequestId,
              let amount = Double(reviewAmount), amount > 0,
              let energy = Double(reviewEnergy),
              let protein = Double(reviewProtein),
              let carbs = Double(reviewCarbs),
              let fat = Double(reviewFat) else { return }
        let key = UUID().uuidString
        do {
            _ = try await env.api.confirmFuelPhoto(
                requestId: photoRequestId,
                body: diaryBody(
                    name: reviewName,
                    energy: energy,
                    protein: protein,
                    carbs: carbs,
                    fat: fat,
                    key: key,
                    source: "ai_estimate",
                    amount: amount,
                    unit: reviewUnit.isEmpty ? "serving" : reviewUnit
                )
            )
            self.photoRequestId = nil
            reviewName = ""
            reviewAmount = "1"
            reviewUnit = "serving"
            reviewEnergy = ""
            reviewProtein = ""
            reviewCarbs = ""
            reviewFat = ""
            message = nil
            await load(date: day?.date ?? LocalDay.todayISO())
        } catch {
            handlePhoto(error)
        }
    }

    private func diaryBody(
        name: String,
        energy: Double,
        protein: Double,
        carbs: Double,
        fat: Double,
        key: String,
        source: String,
        amount: Double = 1,
        unit: String = "serving"
    ) -> DiaryFoodBody {
        DiaryFoodBody(
            name: name,
            occurredAt: ISO8601DateFormatter().string(from: Date()),
            amount: amount,
            unit: unit,
            macros: DiaryMacrosBody(energyKcal: energy, proteinG: protein, carbsG: carbs, fatG: fat),
            idempotencyKey: key,
            operationKey: key,
            compositionSource: source
        )
    }

    private func handlePhoto(_ error: Error) {
        switch FuelPhotoFailureMapping.decide(error) {
        case .crew:
            showingPaywall = true
        case .credits:
            showingCreditPaywall = true
        case .message(let text):
            photoFailed = true
            message = text
        }
    }

    private func handleWrite(_ error: Error) async {
        let code = (error as? APIError)?.code
        if code == "fuel_daily_limit" {
            showingAdd = false
            editingDraft = nil
            showingPaywall = true
        } else {
            message = "That log was not saved."
        }
    }
}
