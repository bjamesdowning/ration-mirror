import Foundation
import Observation

@MainActor
@Observable
final class BillingViewModel {
    private(set) var status: BillingStatus?
    private(set) var isLoading = false
    private(set) var isRestoring = false
    private(set) var purchasingPackageID: String?
    var errorMessage: String?

    func load(api: RationAPI, billing: BillingManager) async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let session = api.session()
            async let billingStatus = api.billingStatus()
            let (sessionResponse, statusResponse) = try await (session, billingStatus)
            await billing.logIn(appUserId: sessionResponse.user.id)
            status = statusResponse
            await billing.loadOfferings()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func purchase(
        packageID: String,
        api: RationAPI,
        billing: BillingManager,
        session: SessionStore
    ) async {
        purchasingPackageID = packageID
        errorMessage = nil
        defer { purchasingPackageID = nil }
        do {
            let outcome = try await billing.purchase(packageID: packageID)
            guard outcome == .completed else { return }
            let baseline = status
            let isCreditPack = billing.packages
                .first(where: { $0.id == packageID })?
                .productIdentifier
                .hasPrefix(AppConfig.creditPackProductPrefix) == true
            // Fulfillment lands via the RC → Ration webhook; poll briefly so the
            // paywall reflects new tier / credits without a manual refresh.
            status = try await BillingFulfillmentPoller.poll(
                baseline: baseline,
                creditPack: isCreditPack,
                fetchStatus: { try await api.billingStatus() }
            )
            _ = await session.load(api: api)
        } catch is CancellationError {
            return
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func restore(api: RationAPI, billing: BillingManager, session: SessionStore) async {
        isRestoring = true
        errorMessage = nil
        defer { isRestoring = false }
        do {
            try await billing.restorePurchases()
            status = try await BillingFulfillmentPoller.poll(
                baseline: status,
                creditPack: false,
                fetchStatus: { try await api.billingStatus() }
            )
            _ = await session.load(api: api)
        } catch is CancellationError {
            return
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
