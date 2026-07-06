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
        case completed(requestId: String, items: [ScanResultItem])
        case confirming
        case confirmed(added: Int, updated: Int)
        case failed(String)
    }

    private(set) var state: State = .idle
    private(set) var selectedItems: Set<String> = []
    private let maxPollAttempts = 80
    private let pollDelayNanoseconds: UInt64 = 1_500_000_000

    func submit(image: UIImage, api: RationAPI) async {
        state = .uploading
        guard let data = image.resizedJPEG(maxDimension: 1024, quality: 0.7) else {
            state = .failed("Could not process the image.")
            return
        }
        do {
            let response = try await api.submitScan(imageData: data)
            guard let requestId = response.requestId else {
                state = .failed("Scan was submitted but no request id was returned.")
                return
            }
            Haptics.light()
            state = .processing(requestId: requestId)
            await poll(requestId: requestId, api: api)
        } catch {
            state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func poll(requestId: String, api: RationAPI) async {
        for attempt in 0..<maxPollAttempts {
            do {
                try await Task.sleep(nanoseconds: pollDelayNanoseconds)
                let result = try await api.scanStatus(requestId: requestId)
                switch result.status {
                case "completed":
                    let items = result.items ?? []
                    selectedItems = Set(items.map(\.id))
                    state = .completed(requestId: requestId, items: items)
                    return
                case "failed":
                    state = .failed(result.error ?? "Scan failed. Please try again.")
                    return
                default:
                    state = .processing(requestId: requestId)
                }
            } catch is CancellationError {
                return
            } catch {
                if let apiError = error as? APIError,
                   [429, 503].contains(apiError.statusCode ?? 0),
                   attempt < maxPollAttempts - 1
                {
                    state = .processing(requestId: requestId)
                    continue
                }
                state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
                return
            }
        }
        state = .failed("Scan is still processing. Pull Cargo to refresh shortly.")
    }

    func toggleSelection(_ item: ScanResultItem) {
        if selectedItems.contains(item.id) {
            selectedItems.remove(item.id)
        } else {
            selectedItems.insert(item.id)
        }
    }

    func confirmToCargo(api: RationAPI, items: [ScanResultItem]) async {
        let chosen = items.filter { selectedItems.contains($0.id) }
        guard !chosen.isEmpty else {
            state = .failed("Select at least one item to add to Cargo.")
            return
        }
        state = .confirming
        let batchItems = chosen.map { item in
            BatchCargoItem(
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                domain: item.domain ?? "food",
                tags: item.tags ?? []
            )
        }
        do {
            let result = try await api.batchAddCargo(BatchCargoRequest(items: batchItems))
            Haptics.success()
            state = .confirmed(added: result.added, updated: result.updated)
        } catch {
            state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func reset() {
        state = .idle
        selectedItems = []
    }
}

struct ScanView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = ScanViewModel()
    @State private var showingCamera = false
    @State private var consent = AIConsentCoordinator()
    @State private var showingPaywall = false

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
                    AIProcessingView(feature: .scanReceipt, creditCost: env.session.session?.aiCosts?.scan ?? 1)
                case let .processing(requestId):
                    processingContent(requestId)
                case let .completed(requestId, items):
                    completedContent(requestId: requestId, items: items)
                case .confirming:
                    AIProcessingView(feature: .scanReceipt, creditCost: nil)
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
            .sheet(isPresented: $showingPaywall) {
                PaywallView()
            }
            .fullScreenCover(isPresented: $showingCamera) {
                CameraPicker { image in
                    showingCamera = false
                    if let image { Task { await model.submit(image: image, api: env.api) } }
                }
                .ignoresSafeArea()
            }
        }
    }

    private var idleContent: some View {
        ScrollView {
            VStack(spacing: 20) {
                AIFeatureInlineIntro(
                    title: "Scan to add items",
                    detail: "AI reads your receipt or pantry photo and suggests items to add to Cargo.",
                    creditCost: scanCreditCost,
                    costLabel: "per scan",
                    nextSteps: "Review detected items before confirming them to Cargo."
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

    private func completedContent(requestId: String, items: [ScanResultItem]) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                GlassCard {
                    VStack(spacing: 8) {
                        Text("Ready to review").rationHeadline()
                        Text("\(items.count) item\(items.count == 1 ? "" : "s") from scan \(requestId.prefix(8))…")
                            .rationCaption()
                    }
                }
                if items.isEmpty {
                    EmptyStateView(icon: "doc.text.magnifyingglass", title: "No items found", message: "Try a clearer receipt photo or add cargo manually.")
                } else {
                    ForEach(items) { item in
                        Button { model.toggleSelection(item) } label: {
                            GlassCard {
                                HStack {
                                    Image(systemName: model.selectedItems.contains(item.id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(model.selectedItems.contains(item.id) ? Theme.hyperGreen : Theme.muted)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(item.name.capitalized).rationBody()
                                        if let domain = item.domain {
                                            Text(domain.capitalized).rationCaption()
                                        }
                                    }
                                    Spacer()
                                    DisplayQuantityLabel(
                                        quantity: item.quantity,
                                        unit: item.unit,
                                        ingredientName: item.name
                                    )
                                    .rationCaption()
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    Button("Add selected to Cargo") {
                        Task { await model.confirmToCargo(api: env.api, items: items) }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    Button("Scan another") { model.reset() }
                        .buttonStyle(SecondaryButtonStyle())
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
                        .font(.system(size: 36))
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

extension UIImage {
    func resizedJPEG(maxDimension: CGFloat, quality: CGFloat) -> Data? {
        let longest = max(size.width, size.height)
        let scale = longest > maxDimension ? maxDimension / longest : 1
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: newSize, format: format)
        let resized = renderer.image { _ in
            draw(in: CGRect(origin: .zero, size: newSize))
        }
        return resized.jpegData(compressionQuality: quality)
    }
}
