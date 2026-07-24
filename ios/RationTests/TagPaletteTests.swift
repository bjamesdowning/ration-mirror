import XCTest
@testable import Ration

final class TagPaletteTests: XCTestCase {
    func testParseHexColorAcceptsHashPrefix() {
        XCTAssertEqual(TagPalette.parseHexColor("#00E088"), 0x00E088)
    }

    func testParseHexColorAcceptsBareHex() {
        XCTAssertEqual(TagPalette.parseHexColor("3B82F6"), 0x3B82F6)
    }

    func testParseHexColorRejectsInvalidValues() {
        XCTAssertNil(TagPalette.parseHexColor("red"))
        XCTAssertNil(TagPalette.parseHexColor("#fff"))
        XCTAssertNil(TagPalette.parseHexColor(""))
    }

    func testSanitizedColorReturnsPaletteMatchCaseInsensitively() {
        XCTAssertEqual(TagPalette.sanitizedColor("#3b82f6"), "#3B82F6")
    }

    func testSanitizedColorRejectsValuesOutsidePalette() {
        XCTAssertNil(TagPalette.sanitizedColor("#ABCDEF"))
        XCTAssertNil(TagPalette.sanitizedColor("javascript:alert(1)"))
    }

    func testSanitizedColorNilForNilInput() {
        XCTAssertNil(TagPalette.sanitizedColor(nil))
    }

    func testChipBackgroundOpacityMatchesWebAlpha() {
        XCTAssertEqual(TagPalette.chipBackgroundOpacity, 0.125, accuracy: 0.0001)
    }

    func testParseHexColorAcceptsPinkPaletteSwatch() {
        XCTAssertEqual(TagPalette.parseHexColor("#EC4899"), 0xEC4899)
    }

    func testParseHexColorRejectsEmptyStringForChipFallback() {
        XCTAssertNil(TagPalette.parseHexColor(""))
    }
}
