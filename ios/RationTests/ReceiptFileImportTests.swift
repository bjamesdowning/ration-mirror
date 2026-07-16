import XCTest
import UniformTypeIdentifiers
@testable import Ration

final class ReceiptFileImportTests: XCTestCase {
    func testMimeTypeFromMagicBytesPDF() {
        let data = Data("%PDF-1.4".utf8)
        XCTAssertEqual(ReceiptFileImport.mimeTypeFromMagicBytes(data), "application/pdf")
    }

    func testMimeTypeFromMagicBytesJPEG() {
        let data = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
        XCTAssertEqual(ReceiptFileImport.mimeTypeFromMagicBytes(data), "image/jpeg")
    }

    func testMimeTypeFromMagicBytesPNG() {
        let data = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        XCTAssertEqual(ReceiptFileImport.mimeTypeFromMagicBytes(data), "image/png")
    }

    func testMimeTypeFromMagicBytesWebP() {
        var bytes: [UInt8] = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]
        bytes += [0x57, 0x45, 0x42, 0x50]
        XCTAssertEqual(ReceiptFileImport.mimeTypeFromMagicBytes(Data(bytes)), "image/webp")
    }

    func testMimeTypeForUTTypes() {
        XCTAssertEqual(ReceiptFileImport.mimeType(for: .pdf), "application/pdf")
        XCTAssertEqual(ReceiptFileImport.mimeType(for: .jpeg), "image/jpeg")
        XCTAssertEqual(ReceiptFileImport.mimeType(for: .png), "image/png")
        XCTAssertEqual(ReceiptFileImport.mimeType(for: .webP), "image/webp")
        XCTAssertNil(ReceiptFileImport.mimeType(for: .plainText))
    }

    func testResolveMimePrefersMagicOverMismatchedExtension() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("receipt.png")
        let jpeg = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
        XCTAssertEqual(
            try ReceiptFileImport.resolveMimeType(for: url, data: jpeg),
            "image/jpeg"
        )
    }

    func testResolveMimeRejectsPDFWithoutMagic() {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("fake.pdf")
        let data = Data("not a pdf".utf8)
        XCTAssertThrowsError(try ReceiptFileImport.resolveMimeType(for: url, data: data)) { error in
            XCTAssertEqual(error as? ReceiptFileImport.ImportError, .unsupportedType)
        }
    }

    func testAssertFileSizeWithinLimitRejectsOversizedMetadata() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("meta-oversized.pdf")
        var data = Data("%PDF-1.4".utf8)
        data.append(Data(repeating: 0x20, count: ReceiptFileImport.maxBytes))
        try data.write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }

        XCTAssertThrowsError(try ReceiptFileImport.assertFileSizeWithinLimit(url)) { error in
            XCTAssertEqual(error as? ReceiptFileImport.ImportError, .tooLarge)
        }
    }

    func testImportFileRejectsTooLarge() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("oversized-receipt.pdf")
        var data = Data("%PDF-1.4".utf8)
        data.append(Data(repeating: 0x20, count: ReceiptFileImport.maxBytes))
        try data.write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }

        XCTAssertThrowsError(try ReceiptFileImport.importFile(from: url)) { error in
            XCTAssertEqual(error as? ReceiptFileImport.ImportError, .tooLarge)
        }
    }

    func testImportFileSucceedsForSmallPDF() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("receipt.pdf")
        let data = Data("%PDF-1.4\n%EOF".utf8)
        try data.write(to: url)

        let imported = try ReceiptFileImport.importFile(from: url)
        XCTAssertEqual(imported.mimeType, "application/pdf")
        XCTAssertEqual(imported.filename, "receipt.pdf")
        XCTAssertEqual(imported.data, data)
        // Sandbox copy should be removed after successful import.
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    }

    func testImportErrorMessages() {
        XCTAssertNil(ReceiptFileImport.ImportError.cancelled.errorDescription)
        XCTAssertEqual(
            ReceiptFileImport.ImportError.tooLarge.errorDescription,
            "File must be 5MB or smaller."
        )
        XCTAssertEqual(
            ReceiptFileImport.ImportError.unsupportedType.errorDescription,
            "Use JPEG, PNG, WebP, or PDF."
        )
    }

    func testAllowedContentTypesMatchServer() {
        XCTAssertEqual(
            Set(ReceiptFileImport.allowedContentTypes),
            Set([.pdf, .jpeg, .png, .webP])
        )
    }
}
