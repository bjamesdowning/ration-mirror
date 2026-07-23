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

    func prepareSheetPresentation(auth: AuthManager, organizationId: String, snapshots: SnapshotStore) async {
        _ = await model.expireIdleConversationIfNeeded(
            auth: auth,
            organizationId: organizationId,
            snapshots: snapshots
        )
        openSheet()
    }

    func closeSheet() {
        isSheetPresented = false
        Task { await model.backgroundSession() }
    }

    /// Awaitable close used when the Ask sheet needs teardown before dismiss.
    func closeSheetAndBackground() async {
        isSheetPresented = false
        await model.backgroundSession()
    }

    func sendFromBar(
        _ text: String,
        api: RationAPI,
        auth: AuthManager,
        organizationId: String,
        snapshots: SnapshotStore
    ) async -> Bool {
        if CopilotDockNewChatPolicy.shouldStartNewChat(
            sheetPresented: isSheetPresented,
            messageCount: model.messages.count
        ) {
            await model.newChat(auth: auth, organizationId: organizationId, snapshots: snapshots)
        }
        return await send(
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
        model.setModelPreset("fast")
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
    ) async {
        isOnboardingBriefing = false
        model.resetBriefingSession()
        await model.newChat(auth: auth, organizationId: organizationId, snapshots: snapshots)
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
