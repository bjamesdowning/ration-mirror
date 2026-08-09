import Foundation
import Observation

/// Thin cache around `/privacy/nutrition` — private user+org snapshot + in-memory status.
@MainActor
@Observable
final class NutritionConsentStore {
    private(set) var consents: [NutritionConsentStatus] = []
    private(set) var syncedAt: Date?
    private(set) var isLoading = false

    private var userId: String?
    private var organizationId: String?
    private var generation = 0

    func configure(userId: String, organizationId: String) {
        if self.userId != userId || self.organizationId != organizationId {
            generation += 1
            self.userId = userId
            self.organizationId = organizationId
            consents = []
            syncedAt = nil
        }
    }

    func invalidate() {
        generation += 1
        userId = nil
        organizationId = nil
        consents = []
        syncedAt = nil
    }

    func status(for purpose: NutritionConsentPurpose) -> NutritionConsentStatus? {
        consents.first { $0.purpose == purpose }
    }

    var hasActiveIntakeConsent: Bool {
        status(for: .intake)?.state == .active
    }

    var hasActiveGoalsConsent: Bool {
        status(for: .goals)?.state == .active
    }

    func restoreCache(snapshots: SnapshotStore) async {
        guard let scope = privateScope else { return }
        guard let cached = await snapshots.load(
            [NutritionConsentStatus].self,
            domain: SnapshotDomain.nutritionConsent,
            scope: scope
        ) else { return }
        consents = cached.payload
        syncedAt = cached.metadata.syncedAt
    }

    func refresh(api: RationAPI, snapshots: SnapshotStore) async throws {
        let gen = generation
        isLoading = true
        defer { isLoading = false }
        let response = try await api.nutritionPrivacy()
        guard gen == generation else { return }
        consents = response.consents
        syncedAt = Date()
        if let scope = privateScope {
            await snapshots.save(
                response.consents,
                domain: SnapshotDomain.nutritionConsent,
                scope: scope
            )
        }
    }

    func grant(
        _ status: NutritionConsentStatus,
        api: RationAPI,
        snapshots: SnapshotStore
    ) async throws {
        let gen = generation
        let response = try await api.grantNutritionConsent(status)
        guard gen == generation else { return }
        consents = response.consents
        syncedAt = Date()
        if let scope = privateScope {
            await snapshots.save(
                response.consents,
                domain: SnapshotDomain.nutritionConsent,
                scope: scope
            )
        }
    }

    func withdraw(
        _ purpose: NutritionConsentPurpose,
        api: RationAPI,
        snapshots: SnapshotStore
    ) async throws {
        let gen = generation
        let response = try await api.withdrawNutritionConsent(purpose)
        guard gen == generation else { return }
        consents = response.consents
        syncedAt = Date()
        if let scope = privateScope {
            await snapshots.save(
                response.consents,
                domain: SnapshotDomain.nutritionConsent,
                scope: scope
            )
        }
    }

    private var privateScope: SnapshotScope? {
        guard let userId, let organizationId else { return nil }
        return .userOrganization(userId: userId, organizationId: organizationId)
    }
}
