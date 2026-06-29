import SwiftUI

/// Single action in the floating action bar — mirrors web `FloatingAction`.
struct FloatingAction: Identifiable {
    let id: String
    let systemImage: String
    let label: String
    var action: () -> Void = {}
    var primary = false
    var variant: Variant = .default
    var disabled = false

    enum Variant {
        case `default`, primary, danger
    }
}
