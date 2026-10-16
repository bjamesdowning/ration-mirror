import AppIntents
import Foundation

struct MarkSupplyPurchasedIntent: AppIntent {
    static var title: LocalizedStringResource = "Mark supply item purchased"
    static var isDiscoverable: Bool = false
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Item")
    var itemId: String

    init() {}

    init(itemId: String) {
        self.itemId = itemId
    }

    func perform() async throws -> some IntentResult {
        await WidgetMutations.markPurchased(itemId: itemId)
        return .result()
    }
}

struct EatCargoStepIntent: AppIntent {
    static var title: LocalizedStringResource = "Eat one"
    static var isDiscoverable: Bool = false
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Cargo")
    var cargoId: String

    @Parameter(title: "Unit")
    var unit: String

    @Parameter(title: "Name")
    var foodName: String

    @Parameter(title: "Quantity", default: 0)
    var quantity: Double

    init() {}

    init(food: HomeWidgetEatFood) {
        self.cargoId = food.cargoId
        self.unit = food.unit
        self.foodName = food.name
        self.quantity = food.quantity
    }

    func perform() async throws -> some IntentResult {
        let food = HomeWidgetEatFood(
            cargoId: cargoId,
            name: foodName,
            action: "eat",
            stepQuantity: 1,
            unit: unit,
            quantity: quantity
        )
        await WidgetMutations.eat(food)
        return .result()
    }
}
