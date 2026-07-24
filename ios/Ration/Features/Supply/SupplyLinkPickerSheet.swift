import SwiftUI

struct SupplyLinkPickerContext: Identifiable, Sendable, Hashable {
    let rowId: String
    var id: String { rowId }
}

struct SupplyLinkPickerSheet: View {
    @Environment(\.dismiss) private var dismiss

    let candidates: [SupplyItem]
    var onSelect: (SupplyItem) -> Void

    @State private var searchText = ""

    private var filtered: [SupplyItem] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return candidates }
        return candidates.filter {
            $0.name.localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if candidates.isEmpty {
                    ContentUnavailableView(
                        "No supply items",
                        systemImage: "link.badge.plus",
                        description: Text("All list items are already linked to a receipt line.")
                    )
                } else if filtered.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                } else {
                    List(filtered) { item in
                        Button {
                            // Parent clears sheet item via link(); avoid double-dismiss.
                            onSelect(item)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.name.capitalized)
                                        .rationBody()
                                        .foregroundStyle(Theme.carbon)
                                    if item.isPurchased {
                                        Text("In cart")
                                            .rationCaption()
                                            .foregroundStyle(Theme.hyperGreen)
                                    }
                                }
                                Spacer()
                                DisplayQuantityLabel(
                                    quantity: item.quantity,
                                    unit: item.unit,
                                    baseQuantity: item.baseQuantity,
                                    baseUnit: item.baseUnit,
                                    ingredientName: item.name
                                )
                                .rationCaption()
                                .foregroundStyle(Theme.muted)
                            }
                        }
                        .accessibilityLabel("Link to \(item.name)")
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.ceramic)
            .navigationTitle("Link to supply")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $searchText, prompt: "Search supply")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
