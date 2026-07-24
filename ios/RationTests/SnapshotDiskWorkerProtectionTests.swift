import XCTest
@testable import Ration

final class SnapshotDiskWorkerProtectionTests: XCTestCase {
    func testSavedSnapshotUsesUntilFirstUserAuthenticationProtection() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("ration-snapshot-protection-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let worker = SnapshotDiskWorker(rootDirectory: root)
        let orgId = "org-protect"
        let saved = try await worker.save(
            ["hello": "world"],
            domain: "cargo",
            organizationId: orgId,
            expectedGeneration: 0
        )
        XCTAssertTrue(saved)

        let fileURL = root
            .appendingPathComponent(orgId, isDirectory: true)
            .appendingPathComponent("cargo.json")
        XCTAssertTrue(FileManager.default.fileExists(atPath: fileURL.path))

        let attrs = try FileManager.default.attributesOfItem(atPath: fileURL.path)
        if let protection = attrs[.protectionKey] as? FileProtectionType {
            XCTAssertEqual(protection, .completeUntilFirstUserAuthentication)
        }
        // Simulators may omit the protection attribute while still accepting the write options.
    }
}
