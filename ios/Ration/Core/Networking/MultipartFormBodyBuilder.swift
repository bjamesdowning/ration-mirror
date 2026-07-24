import Foundation

/// Builds `multipart/form-data` bodies for file uploads (scan image, avatar, etc.).
enum MultipartFormBodyBuilder {
    static func makeBoundary() -> String {
        "Boundary-\(UUID().uuidString)"
    }

    static func contentType(boundary: String) -> String {
        "multipart/form-data; boundary=\(boundary)"
    }

    /// Strips CR/LF and quotes so user-controlled names cannot inject MIME headers.
    static func sanitizeHeaderToken(_ raw: String, fallback: String) -> String {
        let filtered = raw.unicodeScalars
            .filter { scalar in
                scalar != "\r" && scalar != "\n" && scalar != "\"" && scalar != "\\"
                    && scalar != ";" && CharacterSet.controlCharacters.contains(scalar) == false
            }
            .map(String.init)
            .joined()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return filtered.isEmpty ? fallback : String(filtered.prefix(180))
    }

    static func build(
        fieldName: String,
        fileData: Data,
        filename: String,
        mimeType: String,
        boundary: String = makeBoundary()
    ) -> (body: Data, contentType: String) {
        let safeField = sanitizeHeaderToken(fieldName, fallback: "file")
        let safeName = sanitizeHeaderToken(filename, fallback: "upload.bin")
        let safeMime = sanitizeHeaderToken(mimeType, fallback: "application/octet-stream")
        var body = Data()
        body.appendUTF8("--\(boundary)\r\n")
        body.appendUTF8(
            "Content-Disposition: form-data; name=\"\(safeField)\"; filename=\"\(safeName)\"\r\n"
        )
        body.appendUTF8("Content-Type: \(safeMime)\r\n\r\n")
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
