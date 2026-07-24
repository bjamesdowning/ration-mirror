import Foundation

extension RationAPI {
    // Scan
    func submitScan(imageData: Data) async throws -> ScanSubmitResponse {
        try await client.uploadImage("scan", imageData: imageData)
    }

    func submitScanFile(data: Data, filename: String, mimeType: String) async throws -> ScanSubmitResponse {
        try await client.uploadMultipartFile("scan", fieldName: "image", fileData: data, filename: filename, mimeType: mimeType)
    }

    func scanStatus(requestId: String) async throws -> ScanStatusResponse {
        try await client.get("scan/\(requestId)")
    }

    // Avatars
    func uploadUserAvatar(imageData: Data, mimeType: String = "image/jpeg") async throws -> AvatarUploadResponse {
        try await client.uploadAvatar("user/avatar", imageData: imageData, mimeType: mimeType)
    }

    func uploadOrganizationAvatar(imageData: Data, mimeType: String = "image/jpeg") async throws -> OrgAvatarUploadResponse {
        try await client.uploadAvatar("organization/avatar", imageData: imageData, mimeType: mimeType)
    }

}
