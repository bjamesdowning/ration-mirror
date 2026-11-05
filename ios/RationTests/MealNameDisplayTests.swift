import XCTest
@testable import Ration

final class MealNameDisplayTests: XCTestCase {
    func testKeepsTypedCase() {
        XCTAssertEqual(MealNameDisplay.text("BBQ Chicken"), "BBQ Chicken")
        XCTAssertEqual(MealNameDisplay.text("iOS Pasta"), "iOS Pasta")
        XCTAssertEqual(MealNameDisplay.text("Apple Pie"), "Apple Pie")
    }

    func testCapitalizesOldLowercaseRowsWithoutFlatteningLaterLetters() {
        XCTAssertEqual(MealNameDisplay.text("apple pie"), "Apple Pie")
        XCTAssertEqual(MealNameDisplay.text("bbq chicken"), "Bbq Chicken")
        XCTAssertEqual(MealNameDisplay.text("o'brien stew"), "O'brien Stew")
    }
}
