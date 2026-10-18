import Foundation
import Observation

@MainActor
@Observable
final class SavedListViewModel {
    private(set) var list: SupplyList?
    var errorMessage: String?
    var toast: String?
    var canUndo = false
    var isSelecting = false
    var selectedIds: Set<String> = []
    private var undoResult: SupplyAddToLiveResult?
    private let listId: String

    init(listId: String) {
        self.listId = listId
    }

    var items: [SupplyItem] { list?.items ?? [] }

    var missingCount: Int {
        items.filter { SavedListLogic.tap(liveState: $0.live?.state) == .add && ($0.inCargo ?? 0) < $0.quantity }.count
    }

    func load(api: RationAPI) async {
        do {
            list = try await api.supplyList(id: listId).list
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func tap(_ item: SupplyItem) -> SavedListTapAction {
        SavedListLogic.tap(liveState: item.live?.state)
    }

    func add(
        _ item: SupplyItem,
        onExisting: String = "skip",
        api: RationAPI
    ) async {
        let action = tap(item)
        guard action == .add || onExisting == "add_more" else { return }
        guard let mode = onExisting == "add_more" ? "add_all" : SavedListLogic.copyMode(for: .add) else {
            return
        }
        await copy(itemIds: [item.id], mode: mode, onExisting: onExisting, singleName: item.name, api: api)
    }

    func addMissing(api: RationAPI) async {
        await copy(itemIds: nil, mode: "missing_only", onExisting: "skip", singleName: nil, api: api)
    }

    func addAll(api: RationAPI) async {
        await copy(itemIds: nil, mode: "add_all", onExisting: "skip", singleName: nil, api: api)
    }

    func addSelected(api: RationAPI) async {
        await copy(itemIds: Array(selectedIds), mode: "add_all", onExisting: "skip", singleName: nil, api: api)
        isSelecting = false
        selectedIds = []
    }

    func undo(api: RationAPI) async {
        guard let undoResult else { return }
        do {
            _ = try await api.undoAddToLive(id: listId, result: undoResult)
            self.undoResult = nil
            canUndo = false
            toast = "Undone"
            await load(api: api)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func removeFromLive(_ item: SupplyItem, api: RationAPI) async {
        guard item.live?.manualOnly == true, let liveItemId = item.live?.liveItemId else { return }
        let result = SupplyAddToLiveResult(
            added: [.init(sourceItemId: item.id, liveItemId: liveItemId)],
            merged: [],
            counts: .init(added: 1, merged: 0, skippedOnLive: 0, skippedInCart: 0, skippedInCargo: 0)
        )
        do {
            _ = try await api.undoAddToLive(id: listId, result: result)
            toast = "Removed from Live"
            await load(api: api)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func copy(
        itemIds: [String]?,
        mode: String,
        onExisting: String,
        singleName: String?,
        api: RationAPI
    ) async {
        do {
            let response = try await api.copySupplyListToLive(
                id: listId,
                itemIds: itemIds,
                mode: mode,
                onExisting: onExisting
            )
            undoResult = response.result
            canUndo = response.result != nil
            if let counts = response.result?.counts {
                toast = SavedListLogic.toast(for: counts, name: singleName)
            }
            await load(api: api)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
