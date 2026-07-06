import SwiftUI
import UniformTypeIdentifiers

/// Scan source picker for supply replenish — camera, photo library, or PDF upload.
struct ReplenishScanSourceSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onCamera: () -> Void
    let onPhotoLibrary: () -> Void
    let onPDF: (Data, String) -> Void

    @State private var showingDocumentPicker = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("Choose how to capture your receipt.")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)

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
                    title: "PDF receipt",
                    subtitle: "Upload a PDF from Files"
                ) {
                    showingDocumentPicker = true
                }

                Spacer()
            }
            .padding(20)
            .navigationTitle("Scan source")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .background(Theme.ceramic)
            .sheet(isPresented: $showingDocumentPicker) {
                DocumentPicker(contentTypes: [.pdf]) { url in
                    showingDocumentPicker = false
                    guard let url,
                          let data = try? Data(contentsOf: url)
                    else { return }
                    dismiss()
                    onPDF(data, url.lastPathComponent)
                }
            }
        }
        .presentationDetents([.medium])
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

struct DocumentPicker: UIViewControllerRepresentable {
    let contentTypes: [UTType]
    let onPick: (URL?) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: contentTypes)
        picker.delegate = context.coordinator
        picker.allowsMultipleSelection = false
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onPick: (URL?) -> Void
        init(onPick: @escaping (URL?) -> Void) { self.onPick = onPick }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            onPick(urls.first)
        }

        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
            onPick(nil)
        }
    }
}
