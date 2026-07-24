import XCTest
@testable import Ration

final class QuantityValidationTests: XCTestCase {
    func testValidQuantity() {
        if case let .valid(value) = QuantityValidation.validate(
            "2.5",
            locale: Locale(identifier: "en_US")
        ) {
            XCTAssertEqual(value, 2.5)
        } else {
            XCTFail("Expected valid quantity")
        }
    }

    func testRejectsEmptyAndZero() {
        if case let .invalid(message) = QuantityValidation.validate("") {
            XCTAssertEqual(message, "Enter a quantity.")
        } else {
            XCTFail("Expected invalid empty")
        }
        if case let .invalid(message) = QuantityValidation.validate("0") {
            XCTAssertEqual(message, "Quantity must be greater than zero.")
        } else {
            XCTFail("Expected invalid zero")
        }
    }

    func testAllowZeroAcceptsZeroAndRejectsNegative() {
        if case let .valid(value) = QuantityValidation.validate(
            "0",
            locale: Locale(identifier: "en_US"),
            allowZero: true
        ) {
            XCTAssertEqual(value, 0)
        } else {
            XCTFail("Expected valid zero when allowZero")
        }
        if case let .invalid(message) = QuantityValidation.validate(
            "-1",
            locale: Locale(identifier: "en_US"),
            allowZero: true
        ) {
            XCTAssertEqual(message, "Quantity cannot be negative.")
        } else {
            XCTFail("Expected invalid negative when allowZero")
        }
    }

    func testAcceptsLocalizedDecimalSeparator() {
        if case let .valid(value) = QuantityValidation.validate(
            "1,5",
            locale: Locale(identifier: "fr_FR")
        ) {
            XCTAssertEqual(value, 1.5)
        } else {
            XCTFail("Expected localized decimal quantity")
        }
    }
}
