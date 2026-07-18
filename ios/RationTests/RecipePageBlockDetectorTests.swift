import XCTest
@testable import Ration

final class RecipePageBlockDetectorTests: XCTestCase {
    func testDetectsPeopleIncAccessPage() {
        let html = """
        <p>If you are a reader experiencing an access issue, please contact
        support@people.inc</p>
        """
        XCTAssertTrue(RecipePageBlockDetector.isBlockedPageHtml(html))
    }

    func testDoesNotFlagNormalRecipe() {
        let html = """
        <html><body><h1>Potato Salad</h1>
        <p>Boil the potatoes until tender. Mix with mayo and serve.</p>
        </body></html>
        """
        XCTAssertFalse(RecipePageBlockDetector.isBlockedPageHtml(html))
    }
}
