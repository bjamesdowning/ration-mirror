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
    @State private var showingScan = false
    @State private var showingCreditPaywall = false
    @State private var showingTypedBarcode = false
    @State private var barcodePaywall = false
    @State private var editPaywall = false
    @State private var barcodeLogDay: Date?
    @State private var editingDraft: FuelLogWrite?
    @State private var path: [FuelLogRoute] = []
    @State private var barcode = ""
    @State private var message: String?
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
                        FuelConsistencyRows(days: day.consistency)
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
                                Text(FuelScanCopy.rowCalories(item.energyKcal, estimate: item.estimate == true))
                                    .rationCaption()
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
        .sheet(isPresented: $showingAdd) {
            AddFuelSheet(
                fuelDate: day?.date ?? LocalDay.todayISO(),
                onSaved: { Task { await load(date: day?.date ?? LocalDay.todayISO()) } },
                onError: { error in Task { await handleWrite(error) } }
            )
        }
        .sheet(item: $editingDraft) { draft in
            FuelLogEditSheet(draft: draft, showingPaywall: $editPaywall) { next in
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
        .sheet(isPresented: $showingScan) {
            ScanToFuelView(
                photoLogEnabled: env.session.clientFlags.isNutritionPhotoLogEnabled,
                used: day?.used ?? 0,
                limit: day?.limit,
                fuelDate: day?.date ?? LocalDay.todayISO(),
                onSaved: {
                    showingScan = false
                    Task { await load(date: day?.date ?? LocalDay.todayISO()) }
                },
                onCredits: {
                    showingScan = false
                    showingCreditPaywall = true
                }
            )
        }
        .sheet(isPresented: $showingCreditPaywall) { PaywallView(context: .credits()) }
        .sheet(isPresented: $showingTypedBarcode) { typedBarcode }
        .task { await reloadAndHandleDeepLink() }
        .onChange(of: env.deepLinkRouter.fuelGoalsPending) { _, pending in
            if pending { Task { await reloadAndHandleDeepLink() } }
        }
        .onChange(of: env.deepLinkRouter.fuelCreatePending) { _, pending in
            if pending != nil { Task { await reloadAndHandleDeepLink() } }
        }
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
            message = "Fuel did not load."
            return
        }
        await perform(action, used: day.used, limit: day.limit)
    }

    private func perform(_ action: FuelCreateAction, used: Int, limit: Int?) async {
        if action == .scan {
            let decision = FuelActionPolicy.decide(
                action: action,
                used: used,
                limit: limit,
                isOnline: env.network.isOnline,
                cameraDenied: false,
                photoLogEnabled: true
            )
            switch decision {
            case .disabledOffline:
                message = "You're offline."
            case .openPurchase:
                showingPaywall = true
            case .openCamera, .photoLogOff, .cameraOff:
                guard FuelDeviceZone.candidate != nil else {
                    message = FuelDeviceZone.unusableMessage
                    return
                }
                showingScan = true
            default:
                break
            }
            return
        }
        if action == .barcode {
            await ensureCameraAccess()
        }
        let decision = FuelActionPolicy.decide(
            action: action,
            used: used,
            limit: limit,
            isOnline: env.network.isOnline,
            cameraDenied: cameraDenied,
            photoLogEnabled: env.session.clientFlags.isNutritionPhotoLogEnabled
        )
        switch decision {
        case .disabledOffline:
            message = "You're offline."
        case .openPurchase:
            showingPaywall = true
        case .openForm, .openBarcodeCamera, .openTypedBarcode:
            guard FuelDeviceZone.candidate != nil else {
                message = FuelDeviceZone.unusableMessage
                return
            }
            switch decision {
            case .openForm:
                showingAdd = true
            case .openBarcodeCamera:
                showingBarcodeCamera = true
            case .openTypedBarcode:
                showingTypedBarcode = true
            default:
                break
            }
        default:
            break
        }
    }

    private var typedBarcode: some View {
        NavigationStack {
            Form {
                TextField("Barcode", text: $barcode)
                    .keyboardType(.numberPad)
                DatePicker(
                    "Date",
                    selection: Binding(
                        get: {
                            barcodeLogDay ?? LocalDay.date(from: day?.date ?? LocalDay.todayISO()) ?? Date()
                        },
                        set: { barcodeLogDay = $0 }
                    ),
                    displayedComponents: .date
                )
                Button("Look up") { Task { await lookupBarcode() } }
                    .frame(minHeight: 44)
            }
            .navigationTitle("Barcode to Fuel")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { showingTypedBarcode = false }
                }
            }
            .rationFormKeyboardToolbar()
        }
        .sheet(isPresented: $barcodePaywall) { PaywallView(context: .settings()) }
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
        guard let day else {
            message = "Fuel did not load."
            return
        }
        guard env.network.isOnline else {
            message = "You're offline."
            return
        }
        do {
            let result = try await env.api.lookupFoodBarcode(barcode)
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
                    source: "usda",
                    fuelDate: barcodeFuelDate
                )
            )
            showingTypedBarcode = false
            await load(date: day.date)
        } catch {
            await handleWrite(error)
        }
    }

    private var barcodeFuelDate: String {
        if let barcodeLogDay {
            return LocalDay.isoString(from: barcodeLogDay)
        }
        return day?.date ?? LocalDay.todayISO()
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
        unit: String = "serving",
        fuelDate: String? = nil
    ) -> DiaryFoodBody {
        DiaryFoodBody(
            name: name,
            occurredAt: ISO8601DateFormatter().string(from: Date()),
            amount: amount,
            unit: unit,
            macros: DiaryMacrosBody(energyKcal: energy, proteinG: protein, carbsG: carbs, fatG: fat),
            idempotencyKey: key,
            operationKey: key,
            compositionSource: source,
            fuelDate: fuelDate
        )
    }


    private func handleWrite(_ error: Error) async {
        let code = (error as? APIError)?.code
        if FuelSaveLimit.presentsPaywall(code: code) {
            if editingDraft != nil {
                editPaywall = true
                return
            }
            showingTypedBarcode = true
            barcodePaywall = true
            return
        }
        message = (error as? APIError)?.errorDescription ?? "That log was not saved."
    }
}
