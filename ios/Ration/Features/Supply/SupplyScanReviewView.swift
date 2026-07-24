import SwiftUI
import Observation

struct SupplyScanReviewContext: Identifiable, Sendable {
    let id: String
    let listId: String
    let requestId: String
    let match: SupplyScanMatchResponse

    init(listId: String, requestId: String, match: SupplyScanMatchResponse) {
        self.id = requestId
        self.listId = listId
        self.requestId = requestId
        self.match = match
    }
}

struct SupplyScanReviewRow: Identifiable, Sendable {
    let id: String
    let scanItem: ScanResultItem
    var supplyItem: SupplyItem?
    var matchType: String
    var selected: Bool
    /// Mutable dock draft (shared form fields with Cargo photo scan).
    var dockName: String
    var dockQuantity: Double
    var dockUnit: String
    var dockDomain: String
    var dockTags: [String]
    var dockExpiresAt: String?
    var hasDelta: Bool

    func toEditableScanItem() -> EditableScanResultItem {
        let proxy = ScanResultItem(
            id: id,
            name: dockName,
            quantity: dockQuantity,
            unit: dockUnit,
            domain: dockDomain,
            tags: dockTags,
            expiresAt: dockExpiresAt,
            confidence: scanItem.confidence
        )
        return EditableScanResultItem(from: proxy, selected: selected)
    }

    mutating func applyDockEdit(_ edited: EditableScanResultItem) {
        let previousName = dockName
        dockName = edited.name
        dockQuantity = edited.quantity
        dockUnit = edited.unit
        dockDomain = edited.domain ?? "food"
        dockTags = edited.tags
        if let date = edited.expiresAt {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd"
            dockExpiresAt = formatter.string(from: date)
        } else {
            dockExpiresAt = nil
        }
        if supplyItem != nil, dockName != previousName {
            matchType = "manual"
        }
        if let supply = supplyItem {
            hasDelta = abs(dockQuantity - supply.quantity) > 0.0001 || dockUnit != supply.unit
        }
    }
}

struct SupplyScanReviewView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppEnvironment.self) private var env
    let context: SupplyScanReviewContext
    var onSuccess: () -> Void = {}

    @State private var model: SupplyScanReviewViewModel

    init(context: SupplyScanReviewContext, onSuccess: @escaping () -> Void = {}) {
        self.context = context
        self.onSuccess = onSuccess
        _model = State(initialValue: SupplyScanReviewViewModel(match: context.match))
    }

    var body: some View {
        @Bindable var model = model
        NavigationStack {
            List {
                if let errorMessage = model.errorMessage {
                    ErrorBanner(message: errorMessage).listRowBackground(Color.clear)
                }

                if model.rows.isEmpty {
                    Text("No receipt lines to review.")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                        .listRowBackground(Color.clear)
                } else {
                    ForEach(model.rows) { row in
                        reviewRow(row)
                            .listRowBackground(row.selected ? Theme.hyperGreen.opacity(0.08) : Theme.surface)
                    }
                }

                if let supplyOnly = context.match.supplyOnly, !supplyOnly.isEmpty {
                    Section("List only (\(supplyOnly.count))") {
                        ForEach(supplyOnly) { item in
                            HStack {
                                Text(item.name.capitalized)
                                    .rationBody()
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
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.ceramic)
            .navigationTitle("Review receipt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button {
                    Task { await confirmDock() }
                } label: {
                    if model.isSubmitting {
                        ProgressView().tint(Theme.carbon)
                    } else {
                        Text("Dock \(model.selectedCount) item\(model.selectedCount == 1 ? "" : "s") to Cargo")
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(model.selectedCount == 0 || model.isSubmitting)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Theme.ceramic)
            }
            .sheet(item: $model.editingItem) { item in
                ScanItemEditSheet(item: item) { updated in
                    model.saveEdit(updated)
                }
            }
            .sheet(item: $model.paywallContext) { ctx in
                PaywallView(context: ctx)
            }
        }
    }

    @ViewBuilder
    private func reviewRow(_ row: SupplyScanReviewRow) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Button {
                model.toggleSelection(row.id)
            } label: {
                Image(systemName: row.selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(row.selected ? Theme.hyperGreen : Theme.muted)
                    .padding(.top, 2)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(row.selected ? "Deselect item" : "Select item")

            VStack(alignment: .leading, spacing: 6) {
                Text("Receipt")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
                    .textCase(.uppercase)
                Text(row.dockName.capitalized)
                    .rationBody()
                DisplayQuantityLabel(
                    quantity: row.dockQuantity,
                    unit: row.dockUnit,
                    ingredientName: row.dockName
                )
                .rationCaption()
                .foregroundStyle(Theme.muted)

                if !row.dockDomain.isEmpty {
                    Text(row.dockDomain.capitalized)
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                }

                if let supplyItem = row.supplyItem {
                    HStack(spacing: 4) {
                        Image(systemName: "link")
                            .font(.caption)
                            .foregroundStyle(Theme.hyperGreen)
                        Text("Supply: \(supplyItem.name.capitalized)")
                            .rationCaption()
                    }
                    DisplayQuantityLabel(
                        quantity: supplyItem.quantity,
                        unit: supplyItem.unit,
                        baseQuantity: supplyItem.baseQuantity,
                        baseUnit: supplyItem.baseUnit,
                        ingredientName: supplyItem.name
                    )
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
                } else {
                    Text("Receipt only")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                }

                if row.hasDelta {
                    Text("Qty delta — dock \(row.dockQuantity.formatted()) \(row.dockUnit)")
                        .rationCaption()
                        .foregroundStyle(Theme.warning)
                }
            }

            Spacer(minLength: 0)

            Button {
                model.startEdit(row.id)
            } label: {
                Image(systemName: "pencil")
                    .foregroundStyle(Theme.muted)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Edit item")
        }
    }

    private func confirmDock() async {
        guard let result = await model.complete(
            listId: context.listId,
            requestId: context.requestId,
            api: env.api,
            isCrewMember: env.session.isCrewMember
        ) else { return }
        env.notifyCargoDataChanged()
        onSuccess()
        dismiss()
        _ = result
    }
}
