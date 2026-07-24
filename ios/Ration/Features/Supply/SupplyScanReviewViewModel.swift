import Foundation
import Observation

@MainActor
@Observable
final class SupplyScanReviewViewModel {
    private(set) var rows: [SupplyScanReviewRow]
    private(set) var isSubmitting = false
    var errorMessage: String?
    var paywallContext: PaywallContext?
    var editingItem: EditableScanResultItem?

    init(match: SupplyScanMatchResponse) {
        var built: [SupplyScanReviewRow] = match.pairs.map { pair in
            let confident = (pair.scanItem.confidence ?? 1) >= 0.7
            let autoSelect = confident && (pair.matchScore ?? 0) >= 0.7
            let dockQty = pair.quantityProposal?.dockQuantity ?? pair.scanItem.quantity
            let dockUnit = pair.quantityProposal?.dockUnit ?? pair.scanItem.unit
            return SupplyScanReviewRow(
                id: pair.scanItem.id,
                scanItem: pair.scanItem,
                supplyItem: pair.supplyItem,
                matchType: pair.matchType ?? "manual",
                selected: autoSelect,
                dockName: pair.scanItem.name,
                dockQuantity: dockQty,
                dockUnit: dockUnit,
                dockDomain: pair.scanItem.domain ?? "food",
                dockTags: pair.scanItem.tags ?? [],
                dockExpiresAt: pair.scanItem.expiresAt,
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
                    dockName: item.name,
                    dockQuantity: item.quantity,
                    dockUnit: item.unit,
                    dockDomain: item.domain ?? "food",
                    dockTags: item.tags ?? [],
                    dockExpiresAt: item.expiresAt,
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

    func startEdit(_ rowId: String) {
        guard let row = rows.first(where: { $0.id == rowId }) else { return }
        editingItem = row.toEditableScanItem()
    }

    func saveEdit(_ updated: EditableScanResultItem) -> String? {
        guard let index = rows.firstIndex(where: { $0.id == updated.id }) else {
            return "Could not save this item."
        }
        rows[index].applyDockEdit(updated)
        editingItem = nil
        return nil
    }

    func complete(
        listId: String,
        requestId: String,
        api: RationAPI,
        isCrewMember: Bool = false
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
                    name: row.dockName,
                    quantity: row.dockQuantity,
                    unit: row.dockUnit,
                    domain: row.dockDomain,
                    tags: row.dockTags,
                    expiresAt: row.dockExpiresAt
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
        } catch let error as APIError {
            if let ctx = CapacityUpgrade.context(
                from: error,
                isCrewMember: isCrewMember
            ) {
                paywallContext = ctx
                errorMessage = nil
            } else {
                errorMessage = error.errorDescription
            }
            return nil
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }
}
