import XCTest
@testable import Ration

final class ShareImportQueueTests: XCTestCase {
    func testEnqueueKeepsTenAndWritesLegacyKeys() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let suite = "share-import-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        for index in 0..<12 {
            _ = try ShareImportQueue.enqueue(
                url: URL(string: "https://example.com/\(index)")!,
                userText: index == 11 ? "caption" : nil,
                now: Date(timeIntervalSince1970: TimeInterval(1_000 + index)),
                defaults: defaults,
                directory: directory
            )
        }
        let data = try Data(contentsOf: directory.appendingPathComponent(ShareImportQueue.fileName))
        let records = try JSONDecoder().decode([ShareImportRecord].self, from: data)
        XCTAssertEqual(records.count, 10)
        XCTAssertEqual(records.first?.url, "https://example.com/2")
        XCTAssertEqual(defaults.string(forKey: ShareImportQueue.legacyURLKey), "https://example.com/11")
        XCTAssertEqual(defaults.bool(forKey: ShareImportQueue.legacyAutoStartKey), false)
        XCTAssertEqual(defaults.string(forKey: ShareImportQueue.legacyUserTextKey), "caption")
        XCTAssertFalse(ShareImportQueue.flagEnabled(defaults))
    }
}
