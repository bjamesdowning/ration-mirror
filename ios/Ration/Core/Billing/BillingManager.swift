import Foundation
import Observation

#if canImport(RevenueCat)
import RevenueCat
#endif

/// UI-facing purchase option, decoupled from RevenueCat types so the View layer
/// (and a build without the SPM package) compiles cleanly.
struct BillingPackage: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let priceString: String
    let productIdentifier: String
}

@MainActor
@Observable
final class BillingManager {
    enum SDKState: Equatable {
        case notConfigured(String)
        case configured
        case loginRequired(String)
        case loggedIn(userId: String)
    }

    /// Must match the RevenueCat entitlement id in `app/lib/billing.constants.ts`.
    static let crewEntitlementID = "crew_member"

    private(set) var sdkState: SDKState = .notConfigured("RevenueCat SDK not initialized.")
    /// Offering packages from `offerings.current`. Empty until `loadOfferings()`.
    private(set) var packages: [BillingPackage] = []
    private var configured = false
    private var loggedInUserId: String?

    #if canImport(RevenueCat)
    private var rcPackages: [String: Package] = [:]
    #endif

    func configureIfPossible() {
        guard !configured else { return }
        guard let apiKey = Bundle.main.object(forInfoDictionaryKey: "RevenueCatPublicAPIKey") as? String,
              !apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            configured = false
            loggedInUserId = nil
            clearOfferings()
            sdkState = .notConfigured("Set RevenueCatPublicAPIKey in Info.plist to enable native purchases.")
            return
        }

        #if canImport(RevenueCat)
        Purchases.configure(withAPIKey: apiKey)
        configured = true
        sdkState = .configured
        #else
        sdkState = .notConfigured("RevenueCat package is not linked. Regenerate the Xcode project from project.yml.")
        #endif
    }

    func logIn(appUserId: String) async {
        configureIfPossible()
        guard configured else { return }

        #if canImport(RevenueCat)
        do {
            _ = try await Purchases.shared.logIn(appUserId)
            loggedInUserId = appUserId
            sdkState = .loggedIn(userId: appUserId)
        } catch {
            loggedInUserId = nil
            clearOfferings()
            sdkState = .loginRequired("RevenueCat login failed: \(error.localizedDescription). Purchases are disabled until billing reconnects for this account.")
        }
        #endif
    }

    func restorePurchases() async throws {
        configureIfPossible()
        try requireLoggedIn()

        #if canImport(RevenueCat)
        _ = try await Purchases.shared.restorePurchases()
        #endif
    }

    /// Loads the current offering's packages. Never throws — leaves `packages`
    /// empty and surfaces the reason via `sdkState` so the paywall degrades gracefully.
    func loadOfferings() async {
        configureIfPossible()
        guard configured else {
            clearOfferings()
            return
        }
        guard loggedInUserId != nil else {
            clearOfferings()
            sdkState = .loginRequired("RevenueCat must be logged in as your Ration account before purchases are enabled.")
            return
        }

        #if canImport(RevenueCat)
        do {
            let offerings = try await Purchases.shared.offerings()
            let available = offerings.current?.availablePackages ?? []
            var map: [String: Package] = [:]
            var ui: [BillingPackage] = []
            for pkg in available {
                map[pkg.identifier] = pkg
                ui.append(
                    BillingPackage(
                        id: pkg.identifier,
                        title: pkg.storeProduct.localizedTitle,
                        priceString: pkg.storeProduct.localizedPriceString,
                        productIdentifier: pkg.storeProduct.productIdentifier
                    )
                )
            }
            rcPackages = map
            packages = ui
        } catch {
            packages = []
        }
        #endif
    }

    /// Purchases a package by identifier. Returns true when the crew entitlement
    /// is active afterwards, false when the user cancelled.
    func purchase(packageID: String) async throws -> Bool {
        configureIfPossible()
        try requireLoggedIn()

        #if canImport(RevenueCat)
        guard let pkg = rcPackages[packageID] else {
            throw APIError.server(
                status: 404,
                message: "That purchase option is no longer available.",
                code: "package_unavailable"
            )
        }
        let result = try await Purchases.shared.purchase(package: pkg)
        if result.userCancelled { return false }
        return result.customerInfo.entitlements[Self.crewEntitlementID]?.isActive == true
        #else
        throw notConfiguredError()
        #endif
    }

    private func requireLoggedIn() throws {
        guard configured else {
            throw notConfiguredError()
        }
        guard loggedInUserId != nil else {
            throw APIError.server(
                status: 503,
                message: "RevenueCat is not logged in as this Ration account. Purchases are disabled until billing reconnects.",
                code: "revenuecat_login_required"
            )
        }
    }

    private func clearOfferings() {
        packages = []
        #if canImport(RevenueCat)
        rcPackages = [:]
        #endif
    }

    private func notConfiguredError() -> APIError {
        APIError.server(
            status: 503,
            message: "RevenueCat is not configured for this build.",
            code: "revenuecat_not_configured"
        )
    }
}
