import SwiftUI
import UIKit

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
