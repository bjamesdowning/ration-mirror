import XCTest
@testable import Ration

final class TagFilterQueryTests: XCTestCase {
    func testFilterTagsSortsByDisplayName() {
        let result = TagFilterQuery.filterTags(
            available: ["zucchini", "dairy", "bakery"],
            query: ""
        )
        XCTAssertEqual(result, ["bakery", "dairy", "zucchini"])
    }

    func testFilterTagsEmptyQueryReturnsAllSorted() {
        let available = ["spice", "fruit", "beef"]
        let result = TagFilterQuery.filterTags(available: available, query: "   ")
        XCTAssertEqual(result, ["beef", "fruit", "spice"])
    }

    func testFilterTagsMatchesSlug() {
        let result = TagFilterQuery.filterTags(
            available: ["dairy-eggs", "canned-fish", "fruit"],
            query: "dairy"
        )
        XCTAssertEqual(result, ["dairy-eggs"])
    }

    func testFilterTagsMatchesDisplayName() {
        let result = TagFilterQuery.filterTags(
            available: ["bbq-sauce", "beef", "bakery"],
            query: "Bbq"
        )
        XCTAssertEqual(result, ["bbq-sauce"])
    }

    func testFilterTagsNoMatchReturnsEmpty() {
        let result = TagFilterQuery.filterTags(
            available: ["dairy", "fruit"],
            query: "zzzz"
        )
        XCTAssertTrue(result.isEmpty)
    }

    func testFilterTagsPreservesStableAlphabeticalOrderAmongMatches() {
        let result = TagFilterQuery.filterTags(
            available: ["canned-fish", "canned-fruit", "fruit", "canned-veg"],
            query: "canned"
        )
        XCTAssertEqual(result, ["canned-fish", "canned-fruit", "canned-veg"])
    }
}
