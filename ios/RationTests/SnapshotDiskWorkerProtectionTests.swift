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

    func testPrivateManifestSnapshotsDoNotCollideBetweenUsersInOneOrganization() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("ration-snapshot-private-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let worker = SnapshotDiskWorker(rootDirectory: root)
        let organizationId = "shared-org"
        let scopeA = SnapshotScope.userOrganization(userId: "user-a", organizationId: organizationId)
        let scopeB = SnapshotScope.userOrganization(userId: "user-b", organizationId: organizationId)

        _ = try await worker.save(
            ["owner": "user-a"],
            domain: "manifest",
            scope: scopeA,
            expectedGeneration: 0
        )
        _ = try await worker.save(
            ["owner": "user-b"],
            domain: "manifest",
            scope: scopeB,
            expectedGeneration: 0
        )

        let restoredA = try await worker.load(
            [String: String].self,
            domain: "manifest",
            scope: scopeA
        )
        let restoredB = try await worker.load(
            [String: String].self,
            domain: "manifest",
            scope: scopeB
        )
        XCTAssertEqual(restoredA?.payload["owner"], "user-a")
        XCTAssertEqual(restoredB?.payload["owner"], "user-b")

        // Private paths use opaque fingerprints — never raw user IDs in the directory name.
        let orgDir = root.appendingPathComponent(organizationId, isDirectory: true)
        let children = try FileManager.default.contentsOfDirectory(atPath: orgDir.path)
        XCTAssertFalse(children.contains(where: { $0.contains("user-a") || $0.contains("user-b") }))
        XCTAssertTrue(children.contains(where: { $0.hasPrefix("u_") }))
    }

    func testPrivateManifestLoadDoesNotFallBackToLegacyOrgCache() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("ration-snapshot-legacy-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let worker = SnapshotDiskWorker(rootDirectory: root)
        let organizationId = "org-legacy"
        _ = try await worker.save(
            ["owner": "legacy-shared"],
            domain: "manifest",
            organizationId: organizationId,
            expectedGeneration: 0
        )

        let privateLoad = try await worker.load(
            [String: String].self,
            domain: "manifest",
            scope: .userOrganization(userId: "user-a", organizationId: organizationId)
        )
        XCTAssertNil(privateLoad)

        try await worker.clearLegacyManifestSnapshots()
        let legacyAfterClear = try await worker.load(
            [String: String].self,
            domain: "manifest",
            organizationId: organizationId
        )
        XCTAssertNil(legacyAfterClear)
    }
}
