import SwiftUI

extension View {
    /// Overrides the app Hyper-Green accent for destructive delete controls.
    func destructiveDeleteTint() -> some View {
        tint(Theme.danger)
    }

    /// Borderless caption delete buttons (settings rows, inline list actions).
    func destructiveDeleteForeground() -> some View {
        foregroundStyle(Theme.danger)
    }

    /// Leading swipe (swipe right): Supply toggle + Edit — inventory lists (Cargo, Galley).
    func inventoryLeadingSwipeActions(
        isSelectedForSupply: Bool,
        onSupplyToggle: @escaping () -> Void,
        onEdit: @escaping () -> Void,
        showEdit: Bool = true
    ) -> some View {
        swipeActions(edge: .leading) {
            Button(action: onSupplyToggle) {
                Label(
                    isSelectedForSupply ? "Remove" : "Add to Supply",
                    systemImage: isSelectedForSupply ? "cart.fill.badge.minus" : "cart.badge.plus"
                )
            }
            .tint(Theme.hyperGreen)
            if showEdit {
                Button(action: onEdit) {
                    Label("Edit", systemImage: "pencil")
                }
                .tint(Theme.hyperGreen)
            }
        }
    }

    /// Trailing swipe (swipe left): destructive delete with explicit danger tint.
    func destructiveTrailingSwipe(
        label: String = "Delete",
        onDelete: @escaping () -> Void
    ) -> some View {
        swipeActions {
            Button(role: .destructive, action: onDelete) {
                Label(label, systemImage: "trash")
            }
            .tint(Theme.danger)
        }
    }

    /// Trailing swipe (swipe left): Delete only — inventory lists (Cargo, Galley).
    func inventoryDestructiveTrailingSwipe(onDelete: @escaping () -> Void) -> some View {
        destructiveTrailingSwipe(onDelete: onDelete)
    }
}