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
    var dockQuantity: Double
    var dockUnit: String
    var hasDelta: Bool
}

@MainActor
@Observable
final class SupplyScanReviewViewModel {
    private(set) var rows: [SupplyScanReviewRow]
    private(set) var isSubmitting = false
    var errorMessage: String?

    init(match: SupplyScanMatchResponse) {
        var built: [SupplyScanReviewRow] = match.pairs.map { pair in
            let confident = (pair.scanItem.confidence ?? 1) >= 0.7
            let autoSelect = confident && (pair.matchScore ?? 0) >= 0.7
            return SupplyScanReviewRow(
                id: pair.scanItem.id,
                scanItem: pair.scanItem,
                supplyItem: pair.supplyItem,
                matchType: pair.matchType ?? "manual",
                selected: autoSelect,
                dockQuantity: pair.quantityProposal?.dockQuantity ?? pair.scanItem.quantity,
                dockUnit: pair.quantityProposal?.dockUnit ?? pair.scanItem.unit,
                hasDelta: pair.quantityProposal?.hasDelta ?? false
            )
        }

        let receiptOnly = match.receiptOnly ?? []
        for item in receiptOnly {
            let confident = (item.confidence ?? 1) >= 0.7
            built.append(
                SupplyScanReviewRow(
                    id: item.id,
                    scanItem: item,
                    supplyItem: nil,
                    matchType: "manual",
                    selected: confident,
                    dockQuantity: item.quantity,
                    dockUnit: item.unit,
                    hasDelta: false
                )
            )
        }
        rows = built
    }

    var selectedCount: Int {
        rows.filter(\.selected).count
    }

    func toggleSelection(_ rowId: String) {
        guard let index = rows.firstIndex(where: { $0.id == rowId }) else { return }
        rows[index].selected.toggle()
    }

    func complete(
        listId: String,
        requestId: String,
        api: RationAPI
    ) async -> SupplyScanCompleteResponse? {
        let selected = rows.filter(\.selected)
        guard !selected.isEmpty else {
            errorMessage = "Select at least one item to dock."
            return nil
        }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        let pairs = selected.map { row in
            SupplyScanCompletePair(
                scanItemId: row.scanItem.id,
                supplyItemId: row.supplyItem?.id,
                matchType: row.matchType,
                dock: SupplyScanCompleteDock(
                    name: row.scanItem.name,
                    quantity: row.dockQuantity,
                    unit: row.dockUnit,
                    domain: row.scanItem.domain ?? "food",
                    tags: row.scanItem.tags ?? [],
                    expiresAt: row.scanItem.expiresAt
                ),
                updateSupply: row.supplyItem != nil && row.hasDelta
                    ? SupplyScanUpdateSupply(quantity: row.dockQuantity, unit: row.dockUnit)
                    : nil
            )
        }

        do {
            let result = try await api.completeSupplyScan(
                listId: listId,
                requestId: requestId,
                pairs: pairs
            )
            Haptics.success()
            return result
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return nil
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
        }
    }

    @ViewBuilder
    private func reviewRow(_ row: SupplyScanReviewRow) -> some View {
        Button {
            model.toggleSelection(row.id)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: row.selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(row.selected ? Theme.hyperGreen : Theme.muted)
                    .padding(.top, 2)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Receipt")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                        .textCase(.uppercase)
                    Text(row.scanItem.name.capitalized)
                        .rationBody()
                    DisplayQuantityLabel(
                        quantity: row.scanItem.quantity,
                        unit: row.scanItem.unit,
                        ingredientName: row.scanItem.name
                    )
                    .rationCaption()
                    .foregroundStyle(Theme.muted)

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
            }
        }
        .buttonStyle(.plain)
    }

    private func confirmDock() async {
        guard let result = await model.complete(
            listId: context.listId,
            requestId: context.requestId,
            api: env.api
        ) else { return }
        env.notifyCargoDataChanged()
        onSuccess()
        dismiss()
        _ = result
    }
}
