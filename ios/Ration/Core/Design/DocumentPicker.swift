import SwiftUI
import UniformTypeIdentifiers

/// Document picker that copies selected files into the app sandbox for reliable reads.
struct DocumentPicker: UIViewControllerRepresentable {
    let contentTypes: [UTType]
    let onPick: (Result<ReceiptFileImport.ImportedFile, ReceiptFileImport.ImportError>) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(
            forOpeningContentTypes: contentTypes,
            asCopy: true
        )
        picker.delegate = context.coordinator
        picker.allowsMultipleSelection = false
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {
        context.coordinator.onPick = onPick
    }

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        var onPick: (Result<ReceiptFileImport.ImportedFile, ReceiptFileImport.ImportError>) -> Void
        init(onPick: @escaping (Result<ReceiptFileImport.ImportedFile, ReceiptFileImport.ImportError>) -> Void) {
            self.onPick = onPick
        }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            guard let url = urls.first else {
                onPick(.failure(.unreadable))
                return
            }
            do {
                let imported = try ReceiptFileImport.importFile(from: url)
                onPick(.success(imported))
            } catch let error as ReceiptFileImport.ImportError {
                onPick(.failure(error))
            } catch {
                onPick(.failure(.unreadable))
            }
        }

        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
            onPick(.failure(.cancelled))
        }
    }
}
