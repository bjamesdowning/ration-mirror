import Foundation

/// Delete, then Edit, then every other action in its current relative order.
enum DetailOverflowOrder {
    static func placingSharedFirst<T: Equatable>(_ actions: [T], delete: T, edit: T) -> [T] {
        actions.enumerated()
            .sorted { lhs, rhs in
                let left = rank(lhs.element, delete: delete, edit: edit)
                let right = rank(rhs.element, delete: delete, edit: edit)
                if left != right { return left < right }
                return lhs.offset < rhs.offset
            }
            .map(\.element)
    }

    private static func rank<T: Equatable>(_ action: T, delete: T, edit: T) -> Int {
        if action == delete { return 0 }
        if action == edit { return 1 }
        return 2
    }
}

enum CargoOverflowAction: String, Hashable {
    case eat
    case galley
    case edit
    case markEmpty
    case supply
    case delete
}

enum CargoOverflowMenu {
    /// Source order is the menu as it stood before Delete and Edit were pinned.
    static func ordered(showsMarkEmpty: Bool) -> [CargoOverflowAction] {
        var actions: [CargoOverflowAction] = [.eat, .galley, .edit]
        if showsMarkEmpty {
            actions.append(.markEmpty)
        }
        actions.append(contentsOf: [.supply, .delete])
        return DetailOverflowOrder.placingSharedFirst(
            actions,
            delete: .delete,
            edit: .edit
        )
    }
}

enum MealOverflowAction: String, Hashable {
    case cook
    case manifest
    case supply
    case edit
    case delete
}

enum MealOverflowMenu {
    static func ordered() -> [MealOverflowAction] {
        DetailOverflowOrder.placingSharedFirst(
            [.cook, .manifest, .supply, .edit, .delete],
            delete: .delete,
            edit: .edit
        )
    }
}
