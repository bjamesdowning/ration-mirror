import Foundation

/// Cargo plus-menu actions.
///
/// A bottom `Menu` uses automatic element order, so the first action sits
/// nearest the button. Manual add stays the lowest item, and Scan items sits above it.
enum CargoFabAction: Hashable {
    case addItem
    case scanItems

    var title: String {
        switch self {
        case .addItem: "Add item"
        case .scanItems: "Scan items"
        }
    }

    var systemImage: String {
        switch self {
        case .addItem: "plus"
        case .scanItems: "camera.viewfinder"
        }
    }
}

enum CargoFabMenu {
    static func actions(scanEnabled: Bool) -> [CargoFabAction] {
        var actions: [CargoFabAction] = [.addItem]
        if scanEnabled {
            actions.append(.scanItems)
        }
        return actions
    }
}
