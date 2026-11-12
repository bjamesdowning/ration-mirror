import SwiftUI

/// Mode-aware quantity label — mirrors web `DisplayQuantity`.
struct DisplayQuantityLabel: View {
    @Environment(AppEnvironment.self) private var env

    let quantity: Double
    let unit: String
    var baseQuantity: Double?
    var baseUnit: String?
    var ingredientName: String?
    var approximate: Bool = false

    var body: some View {
        Text(formatted)
    }

    private var formatted: String {
        QuantityPresenter.presentStored(
            quantity: quantity,
            unit: unit,
            baseQuantity: baseQuantity,
            baseUnit: baseUnit,
            ingredientName: ingredientName ?? unit,
            mode: env.unitDisplayMode.mode,
            approximate: approximate
        )
    }
}
