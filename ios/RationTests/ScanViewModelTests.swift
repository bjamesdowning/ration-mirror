import XCTest
@testable import Ration

final class EditableScanResultItemTests: XCTestCase {
    private func sampleItem(
        id: String = "item-1",
        name: String = "Tomatoes",
        quantity: Double = 2,
        unit: String = "kg",
        selected: Bool = true
    ) -> EditableScanResultItem {
        EditableScanResultItem(
            from: ScanResultItem(
                id: id,
                name: name,
                quantity: quantity,
                unit: unit,
                domain: "food",
                tags: [],
                expiresAt: nil,
                confidence: 0.9
            ),
            selected: selected
        )
    }

    func testApplyingEditUpdatesFields() {
        let item = sampleItem()
        guard case let .saved(updated) = item.applyingEdit(name: "Cherry Tomatoes", quantityText: "3", unit: "g") else {
            return XCTFail("Expected saved result")
        }
        XCTAssertEqual(updated.name, "Cherry Tomatoes")
        XCTAssertEqual(updated.quantity, 3)
        XCTAssertEqual(updated.unit, "g")
    }

    func testApplyingEditRejectsEmptyName() {
        let item = sampleItem()
        guard case let .invalidName(message) = item.applyingEdit(name: "   ", quantityText: "1", unit: "unit") else {
            return XCTFail("Expected invalid name")
        }
        XCTAssertFalse(message.isEmpty)
    }

    func testApplyingEditRejectsInvalidQuantity() {
        let item = sampleItem()
        guard case let .invalidQuantity(message) = item.applyingEdit(name: "Tomatoes", quantityText: "0", unit: "kg") else {
            return XCTFail("Expected invalid quantity")
        }
        XCTAssertFalse(message.isEmpty)
    }

    func testToBatchCargoItemNormalizesName() {
        let item = sampleItem(name: "  Cherry Tomatoes  ")
        let batch = item.toBatchCargoItem()
        XCTAssertEqual(batch.name, "cherry tomatoes")
        XCTAssertEqual(batch.quantity, 2)
        XCTAssertEqual(batch.unit, "kg")
    }

    func testToBatchCargoItemIncludesTagsAndExpiry() {
        let expiry = Date(timeIntervalSince1970: 1_735_689_600)
        let item = EditableScanResultItem(
            from: ScanResultItem(
                id: "item-2",
                name: "Milk",
                quantity: 1,
                unit: "l",
                domain: "food",
                tags: ["dairy"],
                expiresAt: "2025-01-01T00:00:00.000Z",
                confidence: 0.9
            )
        )
        guard case let .saved(updated) = item.applyingEdit(
            name: "Milk",
            quantityText: "2",
            unit: "l",
            domain: "food",
            tags: ["dairy", "organic"],
            hasExpiry: true,
            expiresAt: expiry
        ) else {
            return XCTFail("Expected saved result")
        }
        let batch = updated.toBatchCargoItem()
        XCTAssertEqual(batch.tags, ["dairy", "organic"])
        XCTAssertEqual(batch.expiresAt, expiry)
    }

    func testScanResultExpiryIsPreservedFromAPI() {
        let item = EditableScanResultItem(
            from: ScanResultItem(
                id: "item-3",
                name: "Yogurt",
                quantity: 1,
                unit: "unit",
                domain: "food",
                tags: ["dairy"],
                expiresAt: "2025-06-15T00:00:00.000Z",
                confidence: 0.8
            )
        )
        XCTAssertNotNil(item.expiresAt)
        XCTAssertEqual(item.tags, ["dairy"])
    }

    func testLowConfidenceFlag() {
        let confident = sampleItem()
        XCTAssertFalse(confident.isLowConfidence)

        let low = EditableScanResultItem(
            from: ScanResultItem(
                id: "item-2",
                name: "Mystery item",
                quantity: 1,
                unit: "unit",
                domain: "food",
                tags: nil,
                expiresAt: nil,
                confidence: 0.5
            )
        )
        XCTAssertTrue(low.isLowConfidence)
    }
}

@MainActor
final class ScanViewModelTests: XCTestCase {
    func testToggleSelectionFlipsSelectedState() {
        let model = ScanViewModel()
        model.reviewItems = [
            EditableScanResultItem(
                from: ScanResultItem(
                    id: "a",
                    name: "Milk",
                    quantity: 1,
                    unit: "l",
                    domain: "food",
                    tags: nil,
                    expiresAt: nil,
                    confidence: nil
                )
            ),
        ]
        XCTAssertTrue(model.reviewItems[0].selected)
        model.toggleSelection("a")
        XCTAssertFalse(model.reviewItems[0].selected)
    }

    func testSaveEditPersistsIntoReviewItems() {
        let model = ScanViewModel()
        model.reviewItems = [
            EditableScanResultItem(
                from: ScanResultItem(
                    id: "a",
                    name: "Milk",
                    quantity: 1,
                    unit: "l",
                    domain: "food",
                    tags: nil,
                    expiresAt: nil,
                    confidence: nil
                )
            ),
        ]
        model.startEditing("a")
        XCTAssertNil(model.saveEdit(id: "a", name: "Oat Milk", quantityText: "2", unit: "l"))
        XCTAssertNil(model.editingItemId)
        XCTAssertEqual(model.reviewItems[0].name, "Oat Milk")
        XCTAssertEqual(model.reviewItems[0].quantity, 2)
    }

    func testSaveEditReturnsValidationError() {
        let model = ScanViewModel()
        model.reviewItems = [
            EditableScanResultItem(
                from: ScanResultItem(
                    id: "a",
                    name: "Milk",
                    quantity: 1,
                    unit: "l",
                    domain: "food",
                    tags: nil,
                    expiresAt: nil,
                    confidence: nil
                )
            ),
        ]
        let error = model.saveEdit(id: "a", name: "", quantityText: "1", unit: "l")
        XCTAssertNotNil(error)
    }

    func testSelectedCountReflectsReviewItems() {
        let model = ScanViewModel()
        model.reviewItems = [
            EditableScanResultItem(
                from: ScanResultItem(
                    id: "a",
                    name: "Milk",
                    quantity: 1,
                    unit: "l",
                    domain: "food",
                    tags: nil,
                    expiresAt: nil,
                    confidence: nil
                )
            ),
            EditableScanResultItem(
                from: ScanResultItem(
                    id: "b",
                    name: "Eggs",
                    quantity: 6,
                    unit: "unit",
                    domain: "food",
                    tags: nil,
                    expiresAt: nil,
                    confidence: nil
                ),
                selected: false
            ),
        ]
        XCTAssertEqual(model.selectedCount, 1)
    }

    func testToBatchCargoItemUsesEditedValuesForSelectedOnly() {
        var first = EditableScanResultItem(
            from: ScanResultItem(
                id: "a",
                name: "Milk",
                quantity: 1,
                unit: "l",
                domain: "food",
                tags: nil,
                expiresAt: nil,
                confidence: nil
            )
        )
        first.name = "Oat Milk"
        first.quantity = 2

        let second = EditableScanResultItem(
            from: ScanResultItem(
                id: "b",
                name: "Eggs",
                quantity: 6,
                unit: "unit",
                domain: "food",
                tags: nil,
                expiresAt: nil,
                confidence: nil
            ),
            selected: false
        )

        let batch = [first, second].filter(\.selected).map { $0.toBatchCargoItem() }
        XCTAssertEqual(batch.count, 1)
        XCTAssertEqual(batch[0].name, "oat milk")
        XCTAssertEqual(batch[0].quantity, 2)
    }

    func testIsEditingReflectsEditingItemId() {
        let model = ScanViewModel()
        XCTAssertFalse(model.isEditing)
        model.startEditing("a")
        XCTAssertTrue(model.isEditing)
        model.cancelEditing()
        XCTAssertFalse(model.isEditing)
    }
}
