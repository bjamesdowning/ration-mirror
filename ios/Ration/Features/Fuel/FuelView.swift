import SwiftUI

/// First dock tab when nutrition-fuel-page is on. Hub stays a toolbar button.
struct FuelView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var used = 0
    @State private var limit: Int? = 3
    @State private var showingAdd = false
    @State private var showingPaywall = false
    @State private var showingGoals = false
    @State private var name = ""
    @State private var calories = ""
    @State private var message: String?
    @State private var barcode = ""

    private var cameraDenied: Bool { false }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Fuel").rationTitle()
                    Spacer()
                    NavigationLink {
                        Text("Macros")
                            .accessibilityLabel("Macros")
                    } label: {
                        Label("Macros", systemImage: "chart.bar.fill")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("Macros")
                }
                Text(FuelActionPolicy.counterLabel(used: used, limit: limit))
                    .font(Typography.body())
                    .minimumScaleFactor(0.7)
                    .accessibilityLabel(FuelActionPolicy.counterLabel(used: used, limit: limit))
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
                Button("No goals · Set targets") { showingGoals = true }
                    .frame(minHeight: 44)
            }
            .padding()
        }
        .navigationTitle("Fuel")
        .sheet(isPresented: $showingAdd) { addSheet }
        .sheet(isPresented: $showingPaywall) { PaywallView(context: .settings()) }
        .sheet(isPresented: $showingGoals) {
            NavigationStack {
                Text("Goals")
                Button("Done") { showingGoals = false }
                    .frame(minHeight: 44)
            }
        }
        .onAppear {
            if env.deepLinkRouter.fuelGoalsPending {
                showingGoals = true
                env.deepLinkRouter.acknowledgeFuel()
            }
            if let pending = env.deepLinkRouter.fuelCreatePending {
                perform(pending)
                env.deepLinkRouter.acknowledgeFuel()
            }
        }
    }

    private func actionButton(_ title: String, action: FuelCreateAction) -> some View {
        Button(title) { perform(action) }
            .frame(maxWidth: .infinity, minHeight: 44)
            .accessibilityLabel(title)
    }

    private func perform(_ action: FuelCreateAction) {
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
            message = "Scan to Fuel uses the camera, then one meal."
        case .cameraOff:
            message = "The camera is off. Scan to Fuel does not upload."
        case .openBarcodeCamera:
            message = nil
        case .openTypedBarcode:
            message = "Enter the barcode."
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
                Button("Save") {
                    Task { await saveTyped() }
                }
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

    private func saveTyped() async {
        let energy = Double(calories) ?? 0
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let key = UUID().uuidString
        let body = DiaryFoodBody(
            name: name,
            occurredAt: ISO8601DateFormatter().string(from: Date()),
            amount: 1,
            unit: "serving",
            macros: DiaryMacrosBody(
                energyKcal: energy,
                proteinG: 0,
                carbsG: 0,
                fatG: 0
            ),
            idempotencyKey: key,
            operationKey: key,
            compositionSource: "manual_macros"
        )
        do {
            _ = try await env.api.logDiaryFood(body)
            used += 1
            showingAdd = false
            name = ""
            calories = ""
        } catch {
            let code = (error as? APIError)?.code
            if code == "fuel_daily_limit" {
                showingAdd = false
                showingPaywall = true
            } else {
                message = "That log was not saved."
            }
        }
    }
}
