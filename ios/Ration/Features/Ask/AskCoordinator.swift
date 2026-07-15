import Foundation
import Observation

@MainActor
@Observable
final class AskCoordinator {
    let model = AskViewModel()
    private(set) var isSheetPresented = false
    var isOnboardingBriefing = false
    var draft = ""
    private var draftOrganizationId: String?

    func load(api: RationAPI, auth: AuthManager, organizationId: String, snapshots: SnapshotStore) async {
        scopeDraft(to: organizationId)
        await model.load(api: api, auth: auth, organizationId: organizationId, snapshots: snapshots)
    }

    @discardableResult
    func scopeDraft(to organizationId: String) -> Bool {
        let didChangeOrganization = draftOrganizationId.map { $0 != organizationId } ?? false
        if didChangeOrganization {
            draft = ""
        }
        draftOrganizationId = organizationId
        return didChangeOrganization
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
        await send(
            text,
            api: api,
            auth: auth,
            organizationId: organizationId,
            snapshots: snapshots,
            presentsSheet: true
        )
    }

    func sendFromSheet(
        _ text: String,
        api: RationAPI,
        auth: AuthManager,
        organizationId: String,
        snapshots: SnapshotStore
    ) async -> Bool {
        await send(
            text,
            api: api,
            auth: auth,
            organizationId: organizationId,
            snapshots: snapshots,
            presentsSheet: false
        )
    }

    func sendOnboardingBootstrap(
        api: RationAPI,
        auth: AuthManager,
        organizationId: String,
        snapshots: SnapshotStore
    ) async -> Bool {
        model.beginOnboardingBriefingSession()
        return await send(
            OnboardingBriefingCopy.bootstrapPrompt,
            api: api,
            auth: auth,
            organizationId: organizationId,
            snapshots: snapshots,
            presentsSheet: false
        )
    }

    func sendOnboardingSeed(
        api: RationAPI,
        auth: AuthManager,
        organizationId: String,
        snapshots: SnapshotStore
    ) async -> Bool {
        model.tracksBriefingSession = true
        model.setModelPreset("deep")
        model.markSeedTurnStarted()
        return await send(
            OnboardingBriefingCopy.seedPrompt,
            api: api,
            auth: auth,
            organizationId: organizationId,
            snapshots: snapshots,
            presentsSheet: false
        )
    }

    /// Tear down briefing conversation so MainTab Ask starts a paid/fresh chat.
    func endOnboardingBriefing(
        auth: AuthManager,
        organizationId: String,
        snapshots: SnapshotStore
    ) {
        isOnboardingBriefing = false
        model.resetBriefingSession()
        model.newChat(auth: auth, organizationId: organizationId, snapshots: snapshots)
    }

    private func send(
        _ text: String,
        api: RationAPI,
        auth: AuthManager,
        organizationId: String,
        snapshots: SnapshotStore,
        presentsSheet: Bool
    ) async -> Bool {
        guard !scopeDraft(to: organizationId) else { return false }
        if presentsSheet {
            isSheetPresented = true
            await Task.yield()
        }
        return await model.send(
            text,
            api: api,
            auth: auth,
            organizationId: organizationId,
            snapshots: snapshots
        )
    }
}
