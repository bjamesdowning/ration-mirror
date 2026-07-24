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

    func testFieldNameImageVariant() {
        let boundary = "Boundary-IMAGE"
        let built = MultipartFormBodyBuilder.build(
            fieldName: "image",
            fileData: Data("pdf-bytes".utf8),
            filename: "receipt.pdf",
            mimeType: "application/pdf",
            boundary: boundary
        )
        let body = String(decoding: built.body, as: UTF8.self)
        XCTAssertTrue(body.contains("name=\"image\""))
        XCTAssertTrue(body.contains("filename=\"receipt.pdf\""))
        XCTAssertTrue(body.contains("Content-Type: application/pdf\r\n\r\n"))
        XCTAssertFalse(body.contains("name=\"avatar\""))
    }
}
