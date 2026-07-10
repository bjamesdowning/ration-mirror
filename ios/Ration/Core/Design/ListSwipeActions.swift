import SwiftUI

extension View {
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
                .tint(Theme.carbon)
            }
        }
    }

    /// Trailing swipe (swipe left): Delete only.
    func inventoryDestructiveTrailingSwipe(onDelete: @escaping () -> Void) -> some View {
        swipeActions {
            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }
        }
    }
}
