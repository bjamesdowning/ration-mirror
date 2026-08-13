import XCTest
@testable import Ration

final class CargoTokenMatcherTests: XCTestCase {
    func testAllowsBreadWhiteBread() {
        XCTAssertTrue(
            CargoTokenMatcher.isTokenPhaseMatch(recipeName: "bread", cargoName: "white bread")
        )
    }

    func testAllowsOilOliveOil() {
        XCTAssertTrue(
            CargoTokenMatcher.isTokenPhaseMatch(recipeName: "oil", cargoName: "olive oil")
        )
    }

    func testRejectsMilkCoconutMilk() {
        XCTAssertFalse(
            CargoTokenMatcher.isTokenPhaseMatch(recipeName: "milk", cargoName: "coconut milk")
        )
    }

    func testRejectsRiceVinegar() {
        XCTAssertFalse(
            CargoTokenMatcher.isTokenPhaseMatch(recipeName: "rice", cargoName: "rice vinegar")
        )
    }

    func testRejectsUltraGenericSauce() {
        XCTAssertFalse(
            CargoTokenMatcher.isTokenPhaseMatch(recipeName: "sauce", cargoName: "tomato sauce")
        )
    }
}
