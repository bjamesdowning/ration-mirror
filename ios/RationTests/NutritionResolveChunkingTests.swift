import XCTest
@testable import Ration

final class NutritionResolveChunkingTests: XCTestCase {
    func testUniqueTrimmedNames() {
        XCTAssertEqual(
            NutritionResolveChunking.uniqueTrimmedNames([" Milk ", "Milk", "Eggs", ""]),
            ["Milk", "Eggs"]
        )
    }

    func testChunksProgressiveSize() {
        let names = (0..<23).map { "item-\($0)" }
        let chunks = NutritionResolveChunking.chunks(names, size: 10)
        XCTAssertEqual(chunks.count, 3)
        XCTAssertEqual(chunks[0].count, 10)
        XCTAssertEqual(chunks[2].count, 3)
    }

    func testChunksRespectApiMax() {
        let names = (0..<60).map { "item-\($0)" }
        let chunks = NutritionResolveChunking.chunks(names, size: 100)
        XCTAssertEqual(chunks[0].count, NutritionResolveChunking.apiMaxNames)
    }
}
