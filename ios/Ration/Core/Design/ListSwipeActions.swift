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

    /// Trailing swipe (swipe left): yellow soft action (full-swipe) + red Delete.
    /// Soft is declared first so it sits nearest the trailing edge and receives the full swipe.
    func inventorySoftHardTrailingSwipe(
        softLabel: String,
        softSystemImage: String,
        showSoft: Bool = true,
        onSoft: @escaping () -> Void,
        onDelete: @escaping () -> Void
    ) -> some View {
        swipeActions(edge: .trailing, allowsFullSwipe: showSoft) {
            if showSoft {
                Button(action: onSoft) {
                    Label(softLabel, systemImage: softSystemImage)
                }
                .tint(Theme.warning)
            }
            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }
            .tint(Theme.danger)
        }
    }

    /// Cargo: Mark Empty (yellow, full-swipe) + Delete (red). Hides Mark Empty when qty is already 0.
    func cargoTrailingSwipeActions(
        quantity: Double,
        onMarkEmpty: @escaping () -> Void,
        onDelete: @escaping () -> Void
    ) -> some View {
        inventorySoftHardTrailingSwipe(
            softLabel: "Mark Empty",
            softSystemImage: "0.circle",
            showSoft: quantity > 0,
            onSoft: onMarkEmpty,
            onDelete: onDelete
        )
    }

    /// Galley: Cook (yellow, full-swipe) + Delete (red).
    func galleyTrailingSwipeActions(
        onCook: @escaping () -> Void,
        onDelete: @escaping () -> Void
    ) -> some View {
        inventorySoftHardTrailingSwipe(
            softLabel: "Cook",
            softSystemImage: "flame",
            onSoft: onCook,
            onDelete: onDelete
        )
    }

    /// Trailing swipe (swipe left): destructive delete with explicit danger tint.
    /// Used by Manifest / Plan Week (Delete only; full swipe disabled).
    func destructiveTrailingSwipe(
        label: String = "Delete",
        onDelete: @escaping () -> Void
    ) -> some View {
        swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive, action: onDelete) {
                Label(label, systemImage: "trash")
            }
            .tint(Theme.danger)
        }
    }
}
