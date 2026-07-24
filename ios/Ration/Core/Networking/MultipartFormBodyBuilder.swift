import Foundation

/// Builds `multipart/form-data` bodies for file uploads (scan image, avatar, etc.).
enum MultipartFormBodyBuilder {
    static func makeBoundary() -> String {
        "Boundary-\(UUID().uuidString)"
    }

    static func contentType(boundary: String) -> String {
        "multipart/form-data; boundary=\(boundary)"
    }

    static func build(
        fieldName: String,
        fileData: Data,
        filename: String,
        mimeType: String,
        boundary: String = makeBoundary()
    ) -> (body: Data, contentType: String) {
        var body = Data()
        body.appendUTF8("--\(boundary)\r\n")
        body.appendUTF8("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(filename)\"\r\n")
        body.appendUTF8("Content-Type: \(mimeType)\r\n\r\n")
        body.append(fileData)
        body.appendUTF8("\r\n--\(boundary)--\r\n")
        return (body, contentType(boundary: boundary))
    }
}

private extension Data {
    mutating func appendUTF8(_ string: String) {
        if let data = string.data(using: .utf8) { append(data) }
    }
}
