import SwiftUI
import UIKit
import Observation

@MainActor
@Observable
final class ScanViewModel {
    enum State {
        case idle
        case uploading
        case processing(requestId: String)
        case completed(requestId: String)
        case confirming
        case confirmed(added: Int, updated: Int)
        case failed(String)
    }

    private(set) var state: State = .idle
    var reviewItems: [EditableScanResultItem] = []
    var editingItemId: String?
    var shouldShowPaywall = false
    var paywallContext: PaywallContext?
    private var activeTask: Task<Void, Never>?
    private var submissionGeneration = 0

    var selectedCount: Int {
        reviewItems.filter(\.selected).count
    }

    var isEditing: Bool {
        editingItemId != nil
    }

    func cancelActiveWork() {
        submissionGeneration += 1
        activeTask?.cancel()
        activeTask = nil
    }

    func submit(image: UIImage, api: RationAPI, session: SessionStore) {
        cancelActiveWork()
        let generation = submissionGeneration
        shouldShowPaywall = false
        state = .uploading
        activeTask = Task {
            do {
                guard let data = try await ScanImageProcessor.resizedJPEG(from: image) else {
                    guard isCurrent(generation) else { return }
                    state = .failed("Could not process the image.")
                    return
                }
                guard isCurrent(generation) else { return }
                let response = try await api.submitScan(imageData: data)
                guard isCurrent(generation) else { return }
                guard let requestId = response.requestId else {
                    state = .failed("Scan was submitted but no request id was returned.")
                    return
                }
                Haptics.light()
                state = .processing(requestId: requestId)
                Task { await AIErrorHandling.refreshCredits(session: session, api: api) }
                await poll(requestId: requestId, api: api, generation: generation)
            } catch is CancellationError {
                return
            } catch {
                guard isCurrent(generation) else { return }
                if AIErrorHandling.mapSubmitError(error) == .paywall {
                    paywallContext = .credits()
                    shouldShowPaywall = true
                    state = .idle
                } else if AIErrorHandling.mapSubmitError(error) == .featureDisabled {
                    state = .failed(AIErrorHandling.featureDisabledMessage)
                } else {
                    state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
                }
            }
        }
    }

    func poll(requestId: String, api: RationAPI, generation: Int) async {
        let poller = AIJobPoller<ScanStatusResponse>(
            fetchStatus: { try await api.scanStatus(requestId: $0) },
            interpretStatus: { result in
                switch result.status {
                case "completed": .completed
                case "failed": .failed(ScanUserFacingError.message(from: result.error))
                default: .running
                }
            }
        )
        do {
            let result = try await poller.poll(requestId: requestId)
            guard isCurrent(generation) else { return }
            let items = result.items ?? []
            reviewItems = items.map { EditableScanResultItem(from: $0) }
            editingItemId = nil
            state = .completed(requestId: requestId)
        } catch is CancellationError {
            return
        } catch AIJobPollError.timedOut {
            guard isCurrent(generation) else { return }
            state = .failed("Scan is still processing. Pull Cargo to refresh shortly.")
        } catch let AIJobPollError.failed(message) {
            guard isCurrent(generation) else { return }
            state = .failed(ScanUserFacingError.message(from: message))
        } catch {
            guard isCurrent(generation) else { return }
            state = .failed(
                ScanUserFacingError.message(
                    from: (error as? APIError)?.errorDescription ?? error.localizedDescription
                )
            )
        }
    }

    func toggleSelection(_ id: String) {
        guard let index = reviewItems.firstIndex(where: { $0.id == id }) else { return }
        reviewItems[index].selected.toggle()
    }

    func startEditing(_ id: String) {
        editingItemId = id
    }

    func cancelEditing() {
        editingItemId = nil
    }

    func saveEdit(_ updated: EditableScanResultItem) -> String? {
        guard let index = reviewItems.firstIndex(where: { $0.id == updated.id }) else { return nil }
        reviewItems[index] = updated
        editingItemId = nil
        Haptics.light()
        return nil
    }

    func saveEdit(id: String, name: String, quantityText: String, unit: String) -> String? {
        guard let index = reviewItems.firstIndex(where: { $0.id == id }) else { return nil }
        switch reviewItems[index].applyingEdit(name: name, quantityText: quantityText, unit: unit) {
        case let .saved(updated):
            reviewItems[index] = updated
            editingItemId = nil
            Haptics.light()
            return nil
        case let .invalidName(message), let .invalidQuantity(message):
            return message
        }
    }

    func confirmToCargo(api: RationAPI) async {
        guard editingItemId == nil else {
            state = .failed("Finish editing before adding to Cargo.")
            return
        }
        let chosen = reviewItems.filter(\.selected)
        guard !chosen.isEmpty else {
            state = .failed("Select at least one item to add to Cargo.")
            return
        }
        state = .confirming
        let batchItems = chosen.map { $0.toBatchCargoItem() }
        do {
            let result = try await api.batchAddCargo(BatchCargoRequest(items: batchItems))
            if let ctx = CapacityUpgrade.context(fromBatchErrors: result.errors) {
                paywallContext = ctx
                shouldShowPaywall = true
                if result.added + result.updated > 0 {
                    Haptics.success()
                    state = .confirmed(added: result.added, updated: result.updated)
                } else {
                    state = .failed(ctx.reasonTitle ?? "Cargo capacity reached")
                }
                return
            }
            Haptics.success()
            state = .confirmed(added: result.added, updated: result.updated)
        } catch let error as APIError {
            if let ctx = CapacityUpgrade.context(from: error) {
                paywallContext = ctx
                shouldShowPaywall = true
                state = .failed(ctx.reasonTitle ?? "Capacity limit reached")
            } else {
                state = .failed(error.errorDescription ?? error.localizedDescription)
            }
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func reset() {
        cancelActiveWork()
        state = .idle
        reviewItems = []
        editingItemId = nil
        shouldShowPaywall = false
        paywallContext = nil
    }

    private func isCurrent(_ generation: Int) -> Bool {
        !Task.isCancelled && generation == submissionGeneration
    }
}

struct ScanView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = ScanViewModel()
    @State private var showingCamera = false
    @State private var consent = AIConsentCoordinator()
    @State private var paywallContext: PaywallContext?
    @State private var editingItem: EditableScanResultItem?

    private var scanCreditCost: Int {
        env.session.session?.aiCosts?.scan ?? 1
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                switch model.state {
                case .idle:
                    idleContent
                case .uploading:
                    AIProcessingView(feature: .scanCargo, creditCost: env.session.session?.aiCosts?.scan ?? 1)
                case let .processing(requestId):
                    processingContent(requestId)
                case let .completed(requestId):
                    completedContent(requestId: requestId)
                case .confirming:
                    AIProcessingView(feature: .scanCargo, creditCost: nil)
                case let .confirmed(added, updated):
                    confirmedContent(added: added, updated: updated)
                case let .failed(message):
                    failedContent(message)
                }
            }
            .frame(maxHeight: .infinity)
            .navigationTitle("Scan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .background(Theme.ceramic)
            .sheet(isPresented: Binding(
                get: { consent.isPresenting },
                set: { if !$0 { consent.decline() } }
            )) {
                AIConsentGateView(
                    onAccept: { Task { await consent.accept(api: env.api, session: env.session) } },
                    onDecline: { consent.decline() }
                )
                .presentationDetents([.large])
            }
            .sheet(item: $paywallContext, onDismiss: {
                model.shouldShowPaywall = false
                model.paywallContext = nil
            }) { ctx in
                PaywallView(context: ctx)
            }
            .sheet(item: $editingItem) { item in
                ScanItemEditSheet(item: item) { updated in
                    model.saveEdit(updated)
                }
            }
            .fullScreenCover(isPresented: $showingCamera) {
                CameraPicker { image in
                    showingCamera = false
                    if let image {
                        model.submit(image: image, api: env.api, session: env.session)
                    }
                }
                .ignoresSafeArea()
            }
            .onChange(of: model.paywallContext?.id) { _, _ in
                if let ctx = model.paywallContext {
                    paywallContext = ctx
                }
            }
            .onChange(of: model.shouldShowPaywall) { _, show in
                // Credits path still flips the Bool before setting context.
                if show, paywallContext == nil {
                    paywallContext = model.paywallContext ?? .credits()
                }
            }
            .onDisappear { model.cancelActiveWork() }
        }
    }

    private var idleContent: some View {
        ScrollView {
            VStack(spacing: 20) {
                AIFeatureInlineIntro(
                    title: "Scan to add items",
                    detail: "AI reads grocery receipts, product labels, or photos of your fridge, pantry, or shelves—and suggests items to add to Cargo.",
                    creditCost: scanCreditCost,
                    costLabel: "per scan",
                    nextSteps: "Review detected items and edit names, quantities, or units before confirming to Cargo."
                )
                AIFeaturePrimaryButton(label: "Open camera", creditCost: scanCreditCost) {
                    proceedAfterIntro()
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func proceedAfterIntro() {
        consent.presentIfNeeded(session: env.session) {
            showingCamera = true
        }
    }

    private func processingContent(_ requestId: String) -> some View {
        GlassCard {
            VStack(spacing: 12) {
                ProgressView().tint(Theme.hyperGreen)
                Text("Extracting items").rationHeadline()
                Text("Request \(requestId) is processing. This usually takes a few seconds.")
                    .rationCaption()
                    .multilineTextAlignment(.center)
            }
        }
        .padding(24)
    }

    private func completedContent(requestId: String) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                GlassCard {
                    VStack(spacing: 8) {
                        Text("Ready to review").rationHeadline()
                        Text("\(model.reviewItems.count) item\(model.reviewItems.count == 1 ? "" : "s") from scan \(requestId.prefix(8))…")
                            .rationCaption()
                        Text("Tap edit to adjust name, quantity, tags, domain, or expiry")
                            .rationCaption()
                            .foregroundStyle(Theme.muted)
                    }
                }
                if model.reviewItems.isEmpty {
                    EmptyStateView(
                        icon: "doc.text.magnifyingglass",
                        title: "No items found",
                        message: "Try a clearer photo or add cargo manually."
                    )
                } else {
                    ForEach(model.reviewItems) { item in
                        ScanReviewItemRow(
                            item: item,
                            onToggleSelection: { model.toggleSelection(item.id) },
                            onStartEdit: { editingItem = item }
                        )
                    }
                    Button("Add selected to Cargo") {
                        Task { await model.confirmToCargo(api: env.api) }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(model.selectedCount == 0 || model.isEditing || editingItem != nil)
                    Button("Scan another") { model.reset() }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(model.isEditing || editingItem != nil)
                }
            }
            .padding(16)
        }
    }

    private func confirmedContent(added: Int, updated: Int) -> some View {
        VStack(spacing: 16) {
            GlassCard {
                VStack(spacing: 8) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(Typography.heroIcon(36))
                        .foregroundStyle(Theme.hyperGreen)
                    Text("Cargo updated").rationHeadline()
                    Text("Added \(added), merged \(updated).")
                        .rationCaption()
                }
            }
            Button("Done") { dismiss() }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.horizontal, 24)
        }
        .padding(24)
    }

    private func failedContent(_ message: String) -> some View {
        VStack(spacing: 16) {
            ErrorBanner(message: message)
            Button("Try again") { model.reset() }
                .buttonStyle(SecondaryButtonStyle())
        }
        .padding(24)
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    var sourceType: UIImagePickerController.SourceType?
    let onResult: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        if let sourceType, UIImagePickerController.isSourceTypeAvailable(sourceType) {
            picker.sourceType = sourceType
        } else {
            picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        }
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onResult: onResult) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onResult: (UIImage?) -> Void
        init(onResult: @escaping (UIImage?) -> Void) { self.onResult = onResult }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            onResult(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onResult(nil)
        }
    }
}
