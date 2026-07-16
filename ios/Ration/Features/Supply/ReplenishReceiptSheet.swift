import SwiftUI

/// Combined AI intro + scan source picker — one screen after "Dock from Receipt".
struct ReplenishReceiptSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppEnvironment.self) private var env

    let creditCost: Int
    let onCamera: () -> Void
    let onPhotoLibrary: () -> Void
    let onFile: (Data, String, String) -> Void

    @State private var showingDocumentPicker = false
    @State private var showingPaywall = false
    @State private var errorMessage: String?

    private var hasEnoughCredits: Bool {
        env.session.credits >= creditCost
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    AIFeatureInlineIntro(
                        title: "Dock from Receipt",
                        detail: "AI reads your receipt, matches lines to your Supply list, then docks purchased items to Cargo.",
                        creditCost: creditCost,
                        costLabel: "per scan",
                        nextSteps: "Choose camera, photo library, or upload a file, then review matches before docking to Cargo. Supported: JPEG, PNG, WebP, PDF · max 5MB."
                    )

                    if let errorMessage {
                        ErrorBanner(message: errorMessage)
                    }

                    if hasEnoughCredits {
                        VStack(spacing: 12) {
                            sourceButton(
                                icon: "camera.fill",
                                title: "Camera",
                                subtitle: "Take a photo of your receipt"
                            ) {
                                dismiss()
                                onCamera()
                            }

                            sourceButton(
                                icon: "photo.on.rectangle",
                                title: "Photo library",
                                subtitle: "Choose an existing receipt image"
                            ) {
                                dismiss()
                                onPhotoLibrary()
                            }

                            sourceButton(
                                icon: "doc.fill",
                                title: "Upload file",
                                subtitle: "Choose a receipt from Files"
                            ) {
                                errorMessage = nil
                                showingDocumentPicker = true
                            }
                        }
                    } else {
                        Button("Get credits") { showingPaywall = true }
                            .buttonStyle(PrimaryButtonStyle())
                    }
                }
                .padding(20)
            }
            .navigationTitle("Dock from Receipt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .background(Theme.ceramic)
            .sheet(isPresented: $showingDocumentPicker) {
                DocumentPicker(contentTypes: ReceiptFileImport.allowedContentTypes) { result in
                    showingDocumentPicker = false
                    switch result {
                    case .success(let imported):
                        // Let the nested picker sheet finish dismissing before parent dismiss + scan.
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                            dismiss()
                            onFile(imported.data, imported.filename, imported.mimeType)
                        }
                    case .failure(.cancelled):
                        break
                    case .failure(let error):
                        errorMessage = error.errorDescription
                            ?? "Could not read the selected file."
                    }
                }
            }
            .sheet(isPresented: $showingPaywall) {
                PaywallView()
            }
        }
        .presentationDetents([.large])
    }

    @ViewBuilder
    private func sourceButton(
        icon: String,
        title: String,
        subtitle: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(Theme.hyperGreen)
                    .frame(width: 40, height: 40)
                    .background(Theme.hyperGreen.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .rationBody()
                        .fontWeight(.semibold)
                        .foregroundStyle(Theme.carbon)
                    Text(subtitle)
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Theme.platinum, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
