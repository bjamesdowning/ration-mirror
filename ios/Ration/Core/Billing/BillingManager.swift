import Foundation
import Observation
import os
import RevenueCat

/// UI-facing purchase option, decoupled from RevenueCat types so views and tests
/// don't depend on the SDK.
struct BillingPackage: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let priceString: String
    let productIdentifier: String
}

@MainActor
@Observable
final class BillingManager {
    /// Associated strings are diagnostics for logs and tests; never show them to customers.
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

    private static let log = Logger(subsystem: "app.ration.ios", category: "Billing")

    private(set) var sdkState: SDKState = .notConfigured("RevenueCat SDK not initialized.")
    /// Offering packages from `offerings.current`. Empty until `loadOfferings()` succeeds.
    private(set) var packages: [BillingPackage] = []
    /// Subscription products (Crew Member, etc.).
    var subscriptionPackages: [BillingPackage] {
        packages.filter { !$0.productIdentifier.hasPrefix(AppConfig.creditPackProductPrefix) }
    }
    /// Consumable credit packs (`credits_s`, `credits_m`, …).
    var creditPackages: [BillingPackage] {
        packages.filter { $0.productIdentifier.hasPrefix(AppConfig.creditPackProductPrefix) }
    }
    private var configured = false
    private var loggedInUserId: String?
    private var rcPackages: [String: Package] = [:]

    func configureIfPossible() {
        guard !configured else { return }
        guard let apiKey = Bundle.main.object(forInfoDictionaryKey: "RevenueCatPublicAPIKey") as? String,
              !apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            loggedInUserId = nil
            clearOfferings()
            setState(.notConfigured("RevenueCatPublicAPIKey is missing from Info.plist."))
            return
        }

        Purchases.configure(withAPIKey: apiKey)
        configured = true
        sdkState = .configured
    }

    func logIn(appUserId: String) async {
        configureIfPossible()
        guard configured else { return }

        do {
            _ = try await Purchases.shared.logIn(appUserId)
            loggedInUserId = appUserId
            sdkState = .loggedIn(userId: appUserId)
        } catch {
            loggedInUserId = nil
            clearOfferings()
            setState(.loginRequired("RevenueCat logIn failed: \(error.localizedDescription)"))
        }
    }

    /// Sets the active Ration group as a RevenueCat subscriber attribute so
    /// credit-pack webhooks can route fulfillment to the correct organization.
    func setBillingOrganizationId(_ organizationId: String) {
        let trimmed = organizationId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        configureIfPossible()
        guard configured, loggedInUserId != nil else { return }
        Purchases.shared.attribution.setAttributes(["organization_id": trimmed])
    }

    func restorePurchases() async throws {
        configureIfPossible()
        try requireLoggedIn()
        _ = try await Purchases.shared.restorePurchases()
    }

    func logOut() async {
        if configured, loggedInUserId != nil {
            _ = try? await Purchases.shared.logOut()
        }
        resetSessionState()
    }

    /// Loads the current offering's packages. Never throws — leaves `packages`
    /// empty (the paywall then offers a retry) and logs the reason.
    func loadOfferings() async {
        configureIfPossible()
        guard configured else {
            clearOfferings()
            return
        }
        guard loggedInUserId != nil else {
            clearOfferings()
            setState(.loginRequired("loadOfferings called before RevenueCat logIn succeeded."))
            return
        }

        do {
            let offerings = try await Purchases.shared.offerings()
            guard let current = offerings.current else {
                clearOfferings()
                Self.log.error("RevenueCat has no current offering.")
                return
            }
            var map: [String: Package] = [:]
            var ui: [BillingPackage] = []
            for pkg in current.availablePackages {
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
                Self.log.error("Current offering has no packages with loaded App Store products.")
            }
        } catch {
            clearOfferings()
            Self.log.error("Could not load offerings: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Purchases a package by identifier.
    /// - Returns `.cancelled` when the user dismisses the payment sheet.
    /// - Returns `.completed` when StoreKit reports a successful purchase
    ///   (subscription or consumable credit pack). Server fulfillment still
    ///   arrives asynchronously via the RevenueCat → Ration webhook.
    func purchase(packageID: String) async throws -> PurchaseOutcome {
        configureIfPossible()
        try requireLoggedIn()

        guard let pkg = rcPackages[packageID] else {
            throw APIError.server(
                status: 404,
                message: "That purchase option is no longer available.",
                code: "package_unavailable"
            )
        }
        let result = try await Purchases.shared.purchase(package: pkg)
        return result.userCancelled ? .cancelled : .completed
    }

    private func requireLoggedIn() throws {
        guard configured else {
            throw unavailableError(code: "revenuecat_not_configured")
        }
        guard loggedInUserId != nil else {
            throw unavailableError(code: "revenuecat_login_required")
        }
    }

    private func setState(_ state: SDKState) {
        sdkState = state
        switch state {
        case let .notConfigured(reason), let .loginRequired(reason):
            Self.log.error("\(reason, privacy: .public)")
        case .configured, .loggedIn:
            break
        }
    }

    private func clearOfferings() {
        packages = []
        rcPackages = [:]
    }

    private func resetSessionState() {
        loggedInUserId = nil
        clearOfferings()
        if configured {
            sdkState = .configured
        }
    }

    private func unavailableError(code: String) -> APIError {
        APIError.server(
            status: 503,
            message: "Purchases are unavailable right now. Try again in a moment.",
            code: code
        )
    }
}
