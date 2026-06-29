import SwiftUI
import Observation

@MainActor
@Observable
final class SupplyViewModel {
    private(set) var list: SupplyList?
    private(set) var isLoading = false
    var errorMessage: String?

    func load(api: RationAPI) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            list = try await api.supply().list
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func toggle(_ item: SupplyItem, api: RationAPI) async {
        guard let current = list else { return }
        let newValue = !item.isPurchased
        let updatedItems = current.items.map { existing in
            existing.id == item.id ? existing.withPurchased(newValue) : existing
        }
        list = SupplyList(id: current.id, name: current.name, items: updatedItems)
        do {
            _ = try await api.toggleSupplyItem(item.id, isPurchased: newValue)
        } catch {
            await load(api: api)
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

private extension SupplyItem {
    func withPurchased(_ value: Bool) -> SupplyItem {
        SupplyItem(id: id, name: name, quantity: quantity, unit: unit, domain: domain, isPurchased: value)
    }
}

struct SupplyView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var model = SupplyViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoading && model.list == nil {
                    LoadingView()
                } else if let list = model.list, !list.items.isEmpty {
                    listView(list)
                } else {
                    EmptyStateView(
                        icon: "cart",
                        title: "Supply list empty",
                        message: "Low and out-of-stock items appear here automatically."
                    )
                }
            }
            .navigationTitle("Supply")
            .background(Theme.ceramic)
        }
        .task { await model.load(api: env.api) }
    }

    private func listView(_ list: SupplyList) -> some View {
        List {
            if let errorMessage = model.errorMessage {
                ErrorBanner(message: errorMessage).listRowBackground(Color.clear)
            }
            ForEach(list.items) { item in
                Button { Task { await model.toggle(item, api: env.api) } } label: {
                    HStack {
                        Image(systemName: item.isPurchased ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(item.isPurchased ? Theme.hyperGreen : Theme.muted)
                        Text(item.name.capitalized)
                            .rationBody()
                            .strikethrough(item.isPurchased)
                            .foregroundStyle(item.isPurchased ? Theme.muted : Theme.carbon)
                        Spacer()
                        Text("\(item.quantity.formatted()) \(item.unit)").rationCaption()
                    }
                }
                .listRowBackground(Theme.surface)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .refreshable { await model.load(api: env.api) }
    }
}
