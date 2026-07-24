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
        let mode = env.unitDisplayMode.mode
        let name = ingredientName ?? unit
        let sourceQty: Double
        let sourceUnit: String
        if mode == .original || baseQuantity == nil || baseUnit == nil {
            sourceQty = quantity
            sourceUnit = unit
        } else {
            sourceQty = baseQuantity ?? quantity
            sourceUnit = baseUnit ?? unit
        }
        return QuantityPresenter.present(
            quantity: sourceQty,
            unit: sourceUnit,
            ingredientName: name,
            mode: mode,
            approximate: approximate
        )
    }
}
