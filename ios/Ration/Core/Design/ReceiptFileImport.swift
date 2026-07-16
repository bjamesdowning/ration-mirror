import Foundation
import UniformTypeIdentifiers

/// Validates and maps receipt files picked from Files for Supply dock scan upload.
enum ReceiptFileImport {
    static let maxBytes = 5 * 1024 * 1024

    static let allowedContentTypes: [UTType] = [.pdf, .jpeg, .png, .webP]

    enum ImportError: LocalizedError, Equatable {
        case cancelled
        case unreadable
        case tooLarge
        case unsupportedType

        var errorDescription: String? {
            switch self {
            case .cancelled:
                return nil
            case .unreadable:
                return "Could not read the selected file."
            case .tooLarge:
                return "File must be 5MB or smaller."
            case .unsupportedType:
                return "Use JPEG, PNG, WebP, or PDF."
            }
        }
    }

    struct ImportedFile {
        let data: Data
        let filename: String
        let mimeType: String
    }

    /// Reads a sandbox copy URL from the document picker and validates size + type.
    /// Checks declared size before loading bytes to avoid memory spikes from oversized files.
    static func importFile(from url: URL) throws -> ImportedFile {
        try assertFileSizeWithinLimit(url)

        let data: Data
        do {
            data = try Data(contentsOf: url, options: [.mappedIfSafe])
        } catch {
            throw ImportError.unreadable
        }

        // Re-check after read in case metadata was wrong or file changed.
        guard data.count <= maxBytes else {
            throw ImportError.tooLarge
        }

        let mimeType = try resolveMimeType(for: url, data: data)
        let filename = url.lastPathComponent.isEmpty ? defaultFilename(for: mimeType) : url.lastPathComponent

        // Clean up the document-picker sandbox copy when possible.
        try? FileManager.default.removeItem(at: url)

        return ImportedFile(data: data, filename: filename, mimeType: mimeType)
    }

    static func assertFileSizeWithinLimit(_ url: URL) throws {
        let values = try? url.resourceValues(forKeys: [.fileSizeKey])
        if let size = values?.fileSize, size > maxBytes {
            throw ImportError.tooLarge
        }
    }

    static func resolveMimeType(for url: URL, data: Data) throws -> String {
        // Prefer sniffed content over extension (handles renamed files securely).
        if let magic = mimeTypeFromMagicBytes(data) {
            return magic
        }

        // No reliable magic — accept image types by UTType/extension only.
        // PDFs without a %PDF header are rejected.
        guard let declared = declaredMimeType(for: url), declared != "application/pdf" else {
            throw ImportError.unsupportedType
        }
        return declared
    }

    static func declaredMimeType(for url: URL) -> String? {
        if let type = UTType(filenameExtension: url.pathExtension),
           let mime = mimeType(for: type)
        {
            return mime
        }
        if let type = (try? url.resourceValues(forKeys: [.contentTypeKey]))?.contentType,
           let mime = mimeType(for: type)
        {
            return mime
        }
        return nil
    }

    static func mimeType(for type: UTType) -> String? {
        if type.conforms(to: .pdf) { return "application/pdf" }
        if type.conforms(to: .jpeg) { return "image/jpeg" }
        if type.conforms(to: .png) { return "image/png" }
        if type.conforms(to: .webP) { return "image/webp" }
        return nil
    }

    /// Cheap magic-byte sniff when extension/UTType is missing or misleading.
    static func mimeTypeFromMagicBytes(_ data: Data) -> String? {
        guard data.count >= 4 else { return nil }
        let bytes = [UInt8](data.prefix(12))

        // %PDF
        if bytes[0] == 0x25, bytes[1] == 0x50, bytes[2] == 0x44, bytes[3] == 0x46 {
            return "application/pdf"
        }
        // PNG
        if bytes[0] == 0x89, bytes[1] == 0x50, bytes[2] == 0x4E, bytes[3] == 0x47 {
            return "image/png"
        }
        // JPEG
        if bytes.count >= 3, bytes[0] == 0xFF, bytes[1] == 0xD8, bytes[2] == 0xFF {
            return "image/jpeg"
        }
        // RIFF....WEBP
        if bytes.count >= 12,
           bytes[0] == 0x52, bytes[1] == 0x49, bytes[2] == 0x46, bytes[3] == 0x46,
           bytes[8] == 0x57, bytes[9] == 0x45, bytes[10] == 0x42, bytes[11] == 0x50
        {
            return "image/webp"
        }
        return nil
    }

    private static func defaultFilename(for mimeType: String) -> String {
        switch mimeType {
        case "application/pdf": return "receipt.pdf"
        case "image/png": return "receipt.png"
        case "image/webp": return "receipt.webp"
        default: return "receipt.jpg"
        }
    }
}
