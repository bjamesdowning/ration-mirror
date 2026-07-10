import Foundation
import Observation

@MainActor
@Observable
final class AskCoordinator {
    let model = AskViewModel()
    private(set) var isSheetPresented = false

    func load(api: RationAPI, auth: AuthManager, organizationId: String, snapshots: SnapshotStore) async {
        await model.load(api: api, auth: auth, organizationId: organizationId, snapshots: snapshots)
    }

    func updateAutoExpandPolicy(scrollContext: CopilotScrollContext) {
        scrollContext.setCanAutoExpand(CopilotAutoExpandPolicy.canAutoExpand(status: model.status))
    }

    func openSheet() {
        isSheetPresented = true
    }

    func closeSheet() {
        isSheetPresented = false
    }

    func sendFromBar(
        _ text: String,
        api: RationAPI,
        auth: AuthManager,
        organizationId: String,
        snapshots: SnapshotStore
    ) async -> Bool {
        isSheetPresented = true
        return await model.send(
            text,
            api: api,
            auth: auth,
            organizationId: organizationId,
            snapshots: snapshots
        )
    }
}
