import SwiftUI
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

    func purchase(packageID: String, api: RationAPI, billing: BillingManager) async {
        purchasingPackageID = packageID
        errorMessage = nil
        defer { purchasingPackageID = nil }
        do {
            let active = try await billing.purchase(packageID: packageID)
            guard active else { return }  // user cancelled
            // Fulfillment lands via the RC → Ration webhook; poll briefly so the
            // paywall reflects the new tier without a manual refresh.
            status = try await pollForActiveStatus(api: api)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func restore(api: RationAPI, billing: BillingManager) async {
        isRestoring = true
        errorMessage = nil
        defer { isRestoring = false }
        do {
            try await billing.restorePurchases()
            status = try await pollForActiveStatus(api: api)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Polls billing status up to ~5s, returning early once the crew entitlement
    /// flips active (RC webhook fulfillment is near-instant but not synchronous).
    private func pollForActiveStatus(api: RationAPI) async throws -> BillingStatus {
        var latest = try await api.billingStatus()
        for _ in 0..<4 where !latest.entitlements.crew_member.active {
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            latest = try await api.billingStatus()
        }
        return latest
    }
}

/// Crew Member + credits paywall.
///
/// Renders entitlement state from `GET /api/mobile/v1/billing/status` and drives
/// native purchases through RevenueCat (`BillingManager`):
///   1. `Purchases.configure(withAPIKey:)` with the public Apple key (NOT the `sk_`/`strp_` server keys).
///   2. `Purchases.shared.logIn(session.user.id)` after auth — `app_user_id` MUST equal `user.id`.
///   3. Buttons are rendered from `offerings.current` packages — App Store product IDs are never hardcoded.
///   4. `Purchases.shared.purchase(package:)`; success is gated on `entitlements["crew_member"].isActive`.
///   5. The RC → Ration webhook updates `user.tier`; the model polls billing status to refresh the UI.
///
/// Final App Store wiring: set `RevenueCatPublicAPIKey` in `Info.plist` and configure a
/// RevenueCat offering whose current packages include the Crew Member product.
struct PaywallView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = BillingViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    header

                    if model.isLoading && model.status == nil {
                        ProgressView().tint(Theme.hyperGreen).padding()
                    } else if let status = model.status {
                        statusCard(status)
                        offerings(status)
                    } else if let errorMessage = model.errorMessage {
                        ErrorBanner(message: errorMessage)
                    }
                }
                .padding(24)
            }
            .background(Theme.ceramic)
            .navigationTitle("Crew Member")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task { await model.load(api: env.api, billing: env.billing) }
    }

    private var header: some View {
        VStack(spacing: 8) {
            Image(systemName: "bolt.shield.fill")
                .font(.system(size: 44))
                .foregroundStyle(Theme.hyperGreen)
            Text("Unlock Crew Member").rationTitle()
            Text("Higher inventory limits, AI scans, and smart logistics.")
                .rationCaption()
                .multilineTextAlignment(.center)
        }
    }

    private func statusCard(_ status: BillingStatus) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Status").rationCaption()
                    Spacer()
                    Text(status.entitlements.crew_member.active ? "Active" : "Inactive")
                        .font(Typography.headline())
                        .foregroundStyle(status.entitlements.crew_member.active ? Theme.hyperGreen : Theme.muted)
                }
                HStack {
                    Text("Credits").rationCaption()
                    Spacer()
                    Text("\(status.credits)").rationBody()
                }
                if let store = status.management.store {
                    HStack {
                        Text("Managed via").rationCaption()
                        Spacer()
                        Text(store.capitalized).rationBody()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func offerings(_ status: BillingStatus) -> some View {
        if status.entitlements.crew_member.active {
            GlassCard {
                VStack(spacing: 8) {
                    Text("You're a Crew Member").rationHeadline()
                    if status.management.store == "stripe" {
                        Text("This subscription is managed on the web via Stripe. Visit ration.mayutic.com to change or cancel.")
                            .rationCaption()
                            .multilineTextAlignment(.center)
                    } else {
                        Text("Manage your subscription in the App Store settings.")
                            .rationCaption()
                            .multilineTextAlignment(.center)
                    }
                }
            }
        } else if status.billingUnavailable {
            ErrorBanner(message: "Billing is temporarily unavailable. Please try again shortly.")
        } else if !status.canPurchaseSubscription {
            ErrorBanner(message: blockMessage(status.purchaseBlockReason))
        } else {
            VStack(spacing: 12) {
                if env.billing.packages.isEmpty {
                    Button("Subscribe — Crew Member") {}
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(true)
                } else {
                    ForEach(env.billing.packages) { pkg in
                        Button {
                            Task {
                                await model.purchase(
                                    packageID: pkg.id,
                                    api: env.api,
                                    billing: env.billing
                                )
                            }
                        } label: {
                            HStack {
                                Text(model.purchasingPackageID == pkg.id ? "Purchasing…" : pkg.title)
                                Spacer()
                                Text(pkg.priceString)
                            }
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(model.purchasingPackageID != nil)
                    }
                }

                Button(model.isRestoring ? "Restoring…" : "Restore purchases") {
                    Task { await model.restore(api: env.api, billing: env.billing) }
                }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(model.isRestoring || model.purchasingPackageID != nil)

                Text(revenueCatStatusText)
                    .rationCaption()
                    .multilineTextAlignment(.center)
            }
        }
    }

    private func blockMessage(_ reason: String?) -> String {
        switch reason {
        case "active_app_store_subscription":
            return "You already have an active subscription via the App Store."
        case "active_stripe_subscription":
            return "You already subscribed on the web. Manage it at ration.mayutic.com."
        default:
            return reason ?? "Subscription purchase is not available right now."
        }
    }

    private var revenueCatStatusText: String {
        if env.billing.packages.isEmpty {
            switch env.billing.sdkState {
            case .configured:
                return "No offerings are available yet. Configure an offering with the Crew Member package in RevenueCat to enable purchases."
            case .loggedIn:
                return "No offerings are available yet. Configure an offering with the Crew Member package in RevenueCat to enable purchases."
            case let .loginRequired(message):
                return message
            case let .notConfigured(message):
                return message
            }
        }
        return "Purchases are processed by the App Store. Your Crew Member status unlocks once Apple confirms the transaction."
    }
}
