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

    /// StoreKit/RevenueCat sheet result — independent of crew entitlement.
    /// Credit packs complete successfully without activating `crew_member`.
    enum PurchaseOutcome: Equatable {
        case cancelled
        case completed
    }

    /// Must match the RevenueCat entitlement id in `app/lib/billing.constants.ts`.
    /// Kept as the canonical client-side id for entitlement checks outside purchase.
    static let crewEntitlementID = "crew_member"

    private(set) var sdkState: SDKState = .notConfigured("RevenueCat SDK not initialized.")
    /// Offering packages from `offerings.current`. Empty until `loadOfferings()`.
    private(set) var packages: [BillingPackage] = []
    /// Subscription products (Crew Member, etc.).
    var subscriptionPackages: [BillingPackage] {
        packages.filter { !$0.productIdentifier.hasPrefix(AppConfig.creditPackProductPrefix) }
    }
    /// Consumable credit packs (`credits_s`, `credits_m`, …).
    var creditPackages: [BillingPackage] {
        packages.filter { $0.productIdentifier.hasPrefix(AppConfig.creditPackProductPrefix) }
    }
    /// Human-readable reason `packages` is empty after `loadOfferings()` (for the paywall).
    private(set) var offeringsMessage: String?
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

    func logOut() async {
        guard configured else {
            resetSessionState()
            return
        }

        #if canImport(RevenueCat)
        if loggedInUserId != nil {
            _ = try? await Purchases.shared.logOut()
        }
        #endif
        resetSessionState()
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
            guard let current = offerings.current else {
                rcPackages = [:]
                packages = []
                offeringsMessage =
                    "No current offering in RevenueCat. Open Product catalog → Offerings and mark \"default\" as Current."
                return
            }

            let available = current.availablePackages
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
            if ui.isEmpty {
                offeringsMessage =
                    "Offering is set but App Store products did not load yet. After ASC shows Ready to Submit, sync can take up to a few hours. Force-quit and reopen, or test on a device with a Sandbox Apple ID."
            } else {
                offeringsMessage = nil
            }
        } catch {
            packages = []
            offeringsMessage = "Could not load offerings: \(error.localizedDescription)"
        }
        #endif
    }

    /// Purchases a package by identifier.
    /// - Returns `.cancelled` when the user dismisses the payment sheet.
    /// - Returns `.completed` when StoreKit reports a successful purchase
    ///   (subscription or consumable credit pack). Server fulfillment still
    ///   arrives asynchronously via the RevenueCat → Ration webhook.
    func purchase(packageID: String) async throws -> PurchaseOutcome {
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
        if result.userCancelled { return .cancelled }
        return .completed
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
        offeringsMessage = nil
        #if canImport(RevenueCat)
        rcPackages = [:]
        #endif
    }

    private func resetSessionState() {
        loggedInUserId = nil
        clearOfferings()
        if configured {
            sdkState = .configured
        }
    }

    private func notConfiguredError() -> APIError {
        APIError.server(
            status: 503,
            message: "RevenueCat is not configured for this build.",
            code: "revenuecat_not_configured"
        )
    }
}
