import AVFoundation
import SwiftUI

/// Scan to Fuel stays on this sheet: explainer, analyzing, review, then one diary write.
struct ScanToFuelView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    var photoLogEnabled: Bool
    var used: Int
    var limit: Int?
    var onSaved: () -> Void
    var onPaywall: () -> Void
    var onCredits: () -> Void

    @State private var phase: Phase = .idle
    @State private var consent = AIConsentCoordinator()
    @State private var showingCamera = false
    @State private var cameraDenied = false
    @State private var failureMessage = ""
    @State private var requestId: String?
    @State private var editing = false
    @State private var photoTask: Task<Void, Never>?
    @State private var name = ""
    @State private var amountText = ""
    @State private var unit = ""
    @State private var energyText = ""
    @State private var proteinText = ""
    @State private var carbsText = ""
    @State private var fatText = ""
    @State private var originalAmount = 1.0
    @State private var originalEnergy = 0.0
    @State private var originalProtein = 0.0
    @State private var originalCarbs = 0.0
    @State private var originalFat = 0.0

    private enum Phase {
        case idle
        case analyzing
        case ready
        case failed
    }

    private var scanCreditCost: Int {
        env.session.session?.aiCosts?.scan ?? 2
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    switch phase {
                    case .idle:
                        idleContent
                    case .analyzing:
                        analyzingCard
                    case .ready:
                        readyContent
                    case .failed:
                        failedContent
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .navigationTitle("Scan to Fuel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .background(Theme.ceramic)
        }
        .sheet(isPresented: $showingCamera) {
            CameraPicker(sourceType: .camera) { image in
                showingCamera = false
                guard let image else { return }
                Task { await upload(image) }
            }
        }
        .sheet(isPresented: $editing) {
            editSheet
        }
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
        .onDisappear { photoTask?.cancel() }
    }

    private var idleContent: some View {
        VStack(alignment: .leading, spacing: 20) {
            AIFeatureInlineIntro(
                title: "Scan to Fuel",
                detail: "A plate, a set of ingredients, one item, or a drink. The estimate is from what is visible.",
                creditCost: scanCreditCost,
                costLabel: "per photo",
                nextSteps: FuelScanCopy.nextSteps,
                hint: AIFeatureInlineIntro.nutritionHint
            )
            Text(FuelScanCopy.notMedicalAdvice)
                .rationCaption()
                .foregroundStyle(Theme.muted)
            if photoLogEnabled {
                if cameraDenied {
                    Text("The camera is off. Scan to Fuel does not upload.")
                        .rationCaption()
                }
                AIFeaturePrimaryButton(label: "Open camera", creditCost: scanCreditCost) {
                    consent.presentIfNeeded(session: env.session) {
                        Task { await openCamera() }
                    }
                }
            } else {
                Text(FuelScanCopy.unavailable)
                    .rationBody()
            }
        }
    }

    private var analyzingCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 6) {
                Text(FuelScanCopy.analyzing).rationHeadline()
                Text(FuelScanCopy.analyzingDetail)
                    .rationCaption()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var readyContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            GlassCard {
                VStack(alignment: .leading, spacing: 6) {
                    Text(FuelScanCopy.readyTitle).rationHeadline()
                    Text(FuelScanCopy.readyCount).rationCaption()
                    Text(FuelScanCopy.readyHint)
                        .rationCaption()
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(name).rationBody()
                    Text("\(amountText) \(unit)").rationCaption()
                    Text("\(energyText) kcal").rationCaption()
                }
                Spacer(minLength: 8)
                Button("Edit") { editing = true }
                    .frame(minHeight: 44)
            }
            Button(FuelScanCopy.addToFuel) { Task { await confirm() } }
                .buttonStyle(AIButtonStyle())
                .accessibilityIdentifier("fuel.photo.confirm")
            Button("Scan another") { resetToIdle() }
                .frame(minHeight: 44)
        }
    }

    private var failedContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(failureMessage).rationBody()
            Button("Try again") { resetToIdle() }
                .frame(minHeight: 44)
        }
    }

    private var editSheet: some View {
        NavigationStack {
            Form {
                LabeledContent("Name") {
                    TextField("Name", text: $name)
                }
                LabeledContent("Amount") {
                    TextField("Amount", text: $amountText)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("Unit") {
                    TextField("Unit", text: $unit)
                        .multilineTextAlignment(.trailing)
                }
                labeledMacro("Calories (kcal)", text: $energyText)
                labeledMacro("Protein (g)", text: $proteinText)
                labeledMacro("Carbs (g)", text: $carbsText)
                labeledMacro("Fat (g)", text: $fatText)
            }
            .navigationTitle("Edit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { editing = false }
                }
            }
        }
    }

    private func labeledMacro(_ title: String, text: Binding<String>) -> some View {
        LabeledContent(title) {
            TextField(title, text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
        }
    }

    private func openCamera() async {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        if status == .notDetermined {
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            cameraDenied = !granted
        } else {
            cameraDenied = status != .authorized
        }
        if cameraDenied { return }
        let decision = FuelActionPolicy.decide(
            action: .scan,
            used: used,
            limit: limit,
            isOnline: env.network.isOnline,
            cameraDenied: false,
            photoLogEnabled: true
        )
        if decision == .openPurchase {
            onPaywall()
            return
        }
        guard FuelDeviceZone.candidate != nil else {
            failureMessage = FuelDeviceZone.unusableMessage
            phase = .failed
            return
        }
        showingCamera = true
    }

    private func upload(_ image: UIImage) async {
        let jpeg: Data?
        do {
            jpeg = try await ScanImageProcessor.resizedJPEG(from: image)
        } catch is CancellationError {
            return
        } catch {
            failureMessage = "That photo was not queued."
            phase = .failed
            return
        }
        guard let jpeg else { return }
        if jpeg.count > 3 * 1024 * 1024 {
            failureMessage = "Photo must be 3 MiB or smaller."
            phase = .failed
            return
        }
        phase = .analyzing
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
                    failureMessage = FuelPhotoPollCaption.message(status: status.status)
                        ?? "Photo status: \(status.status)."
                    phase = .failed
                    return
                }
                apply(lines: lines, requestId: queued.requestId)
                phase = .ready
            } catch is CancellationError {
                return
            } catch {
                await MainActor.run { handlePhoto(error) }
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

    private func apply(lines: [FuelPhotoStatusResponse.Line], requestId: String) {
        let amount = lines.first?.amount ?? 1
        let energy = lines.reduce(0) { $0 + ($1.energyKcal ?? 0) }
        let protein = lines.reduce(0) { $0 + ($1.proteinG ?? 0) }
        let carbs = lines.reduce(0) { $0 + ($1.carbsG ?? 0) }
        let fat = lines.reduce(0) { $0 + ($1.fatG ?? 0) }
        self.requestId = requestId
        originalAmount = amount > 0 ? amount : 1
        originalEnergy = energy
        originalProtein = protein
        originalCarbs = carbs
        originalFat = fat
        name = lines.map { $0.name?.trimmingCharacters(in: .whitespacesAndNewlines) }.map { value in
            let trimmed = value ?? ""
            return trimmed.isEmpty ? "Food" : trimmed
        }.joined(separator: ", ")
        amountText = FuelLogWrite.macroDisplay(originalAmount)
        let rawUnit = lines.first?.unit?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        unit = rawUnit.isEmpty ? "serving" : rawUnit
        energyText = FuelLogWrite.macroDisplay(energy)
        proteinText = FuelLogWrite.macroDisplay(protein)
        carbsText = FuelLogWrite.macroDisplay(carbs)
        fatText = FuelLogWrite.macroDisplay(fat)
    }

    private func confirm() async {
        guard let requestId,
              let amount = FuelLogWrite.storedValue(
                original: originalAmount,
                display: FuelLogWrite.macroDisplay(originalAmount),
                edited: amountText
              ), amount > 0,
              let energy = FuelLogWrite.storedValue(
                original: originalEnergy,
                display: FuelLogWrite.macroDisplay(originalEnergy),
                edited: energyText
              ), energy >= 0,
              let protein = FuelLogWrite.storedValue(
                original: originalProtein,
                display: FuelLogWrite.macroDisplay(originalProtein),
                edited: proteinText
              ), protein >= 0,
              let carbs = FuelLogWrite.storedValue(
                original: originalCarbs,
                display: FuelLogWrite.macroDisplay(originalCarbs),
                edited: carbsText
              ), carbs >= 0,
              let fat = FuelLogWrite.storedValue(
                original: originalFat,
                display: FuelLogWrite.macroDisplay(originalFat),
                edited: fatText
              ), fat >= 0,
              !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !unit.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return }
        let key = UUID().uuidString
        do {
            _ = try await env.api.confirmFuelPhoto(
                requestId: requestId,
                body: DiaryFoodBody(
                    name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                    occurredAt: ISO8601DateFormatter().string(from: Date()),
                    amount: amount,
                    unit: unit.trimmingCharacters(in: .whitespacesAndNewlines),
                    macros: DiaryMacrosBody(
                        energyKcal: energy,
                        proteinG: protein,
                        carbsG: carbs,
                        fatG: fat
                    ),
                    idempotencyKey: key,
                    operationKey: key,
                    compositionSource: "ai_estimate"
                )
            )
            onSaved()
            dismiss()
        } catch {
            handlePhoto(error)
        }
    }

    private func handlePhoto(_ error: Error) {
        switch FuelPhotoFailureMapping.decide(error) {
        case .crew:
            onPaywall()
        case .credits:
            onCredits()
        case .message(let text):
            failureMessage = text
            phase = .failed
        }
    }

    private func resetToIdle() {
        photoTask?.cancel()
        requestId = nil
        failureMessage = ""
        phase = .idle
    }
}
