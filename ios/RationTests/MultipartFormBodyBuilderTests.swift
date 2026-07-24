import XCTest
@testable import Ration

final class MultipartFormBodyBuilderTests: XCTestCase {
    func testBuildsBoundaryDispositionMimeAndClose() {
        let boundary = "Boundary-TEST-123"
        let fileData = Data("hello".utf8)
        let built = MultipartFormBodyBuilder.build(
            fieldName: "image",
            fileData: fileData,
            filename: "scan.jpg",
            mimeType: "image/jpeg",
            boundary: boundary
        )

        XCTAssertEqual(built.contentType, "multipart/form-data; boundary=\(boundary)")

        let body = String(decoding: built.body, as: UTF8.self)
        XCTAssertTrue(body.hasPrefix("--\(boundary)\r\n"))
        XCTAssertTrue(body.contains("Content-Disposition: form-data; name=\"image\"; filename=\"scan.jpg\"\r\n"))
        XCTAssertTrue(body.contains("Content-Type: image/jpeg\r\n\r\n"))
        XCTAssertTrue(body.contains("hello"))
        XCTAssertTrue(body.hasSuffix("\r\n--\(boundary)--\r\n"))
    }

    func testFieldNameAvatarVariant() {
        let boundary = "Boundary-AVATAR"
        let built = MultipartFormBodyBuilder.build(
            fieldName: "avatar",
            fileData: Data([0xFF, 0xD8]),
            filename: "avatar.jpg",
            mimeType: "image/jpeg",
            boundary: boundary
        )
        let body = String(decoding: built.body, as: UTF8.self)
        XCTAssertTrue(body.contains("name=\"avatar\""))
        XCTAssertFalse(body.contains("name=\"image\""))
        XCTAssertEqual(built.contentType, MultipartFormBodyBuilder.contentType(boundary: boundary))
    }

    func testSanitizesCRLFAndQuotesInFilename() {
        let boundary = "Boundary-SAFE"
        let built = MultipartFormBodyBuilder.build(
            fieldName: "image\r\nX-Injected: 1",
            fileData: Data("x".utf8),
            filename: "evil\".jpg\r\nContent-Type: text/plain",
            mimeType: "image/jpeg",
            boundary: boundary
        )
        let body = String(decoding: built.body, as: UTF8.self)
        // Header injection vectors must not survive as control characters / quotes.
        XCTAssertFalse(body.contains("\r\nX-Injected"))
        XCTAssertFalse(body.contains("filename=\"evil\""))
        XCTAssertFalse(body.contains("\r\nContent-Type: text/plain"))
        XCTAssertTrue(body.contains("name=\"imageX-Injected: 1\""))
        XCTAssertTrue(body.contains("filename=\"evil.jpgContent-Type: text/plain\""))
        XCTAssertEqual(
            MultipartFormBodyBuilder.sanitizeHeaderToken("", fallback: "upload.bin"),
            "upload.bin"
        )
    }
}
