import SwiftUI

struct ListOriginChip: View {
    let createdFrom: String?

    var body: some View {
        Label(SavedListLogic.originLabel(createdFrom), systemImage: SavedListLogic.originSymbol(createdFrom))
            .font(Typography.caption())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Theme.surface)
            .clipShape(Capsule())
            .foregroundStyle(Theme.carbon)
    }
}

struct SavedListItemRow: View {
    let item: SupplyItem
    var selecting: Bool
    var selected: Bool
    var onAdd: () -> Void
    var onToggle: () -> Void
    var onAddMore: () -> Void
    var onRemove: (() -> Void)?

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            if selecting {
                Button(action: onToggle) {
                    Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                        .font(.title2)
                        .foregroundStyle(selected ? Theme.hyperGreen : Theme.muted)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Select \(item.name)")
            } else {
                Button(action: onAdd) {
                    Image(systemName: item.live?.state == "on_live" ? "checkmark.circle.fill" : "plus.circle")
                        .font(.title2)
                        .foregroundStyle(item.live?.state == "on_live" ? Theme.hyperGreen : Theme.carbon)
                        .contentTransition(.symbolEffect(.replace))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(addLabel)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(item.name.capitalized)
                    .rationBody()
                    .foregroundStyle(Theme.carbon)
                Text(statusText)
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            Text("\(format(item.quantity)) \(item.unit)")
                .rationCaption()
                .foregroundStyle(Theme.muted)
        }
        .contextMenu {
            if SavedListLogic.tap(liveState: item.live?.state) == .add {
                Button("Add to Live", systemImage: "plus", action: onAdd)
            } else {
                Button("Add More", systemImage: "plus", action: onAddMore)
            }
            if let onRemove {
                Button("Remove from Live", systemImage: "minus.circle", action: onRemove)
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if SavedListLogic.tap(liveState: item.live?.state) == .add {
                Button(action: onAdd) {
                    Label("Add to Live", systemImage: "plus")
                }
                .tint(Theme.hyperGreen)
            }
        }
    }

    private var addLabel: String {
        switch item.live?.state {
        case "on_live": "\(item.name) is on Live"
        case "in_cart": "\(item.name) is in the cart"
        default: "Add \(item.name) to Live"
        }
    }

    private var statusText: String {
        let line = SavedListLogic.statusLine(for: item)
        return line.isEmpty ? "Not on Live" : line
    }

    private func format(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(value)
    }
}
