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

/// Crew Member + credit packs paywall (RevenueCat offering-driven).
struct PaywallView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
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
            activeSubscriberCard(status)
            creditPackSection
        } else if status.billingUnavailable {
            ErrorBanner(message: "Billing is temporarily unavailable. Please try again shortly.")
        } else if !status.canPurchaseSubscription {
            ErrorBanner(message: blockMessage(status.purchaseBlockReason))
        } else {
            VStack(spacing: 12) {
                subscriptionSection
                creditPackSection

                Button(model.isRestoring ? "Restoring…" : "Restore purchases") {
                    Task { await model.restore(api: env.api, billing: env.billing) }
                }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(model.isRestoring || model.purchasingPackageID != nil)

                Text(revenueCatStatusText)
                    .rationCaption()
                    .multilineTextAlignment(.center)

                subscriptionDisclosure
            }
        }
    }

    private var subscriptionDisclosure: some View {
        VStack(spacing: 8) {
            Text("Subscriptions renew automatically through your Apple ID until cancelled at least 24 hours before the end of the current period. Manage or cancel in App Store account settings after purchase.")
                .rationCaption()
                .multilineTextAlignment(.center)
            HStack(spacing: 12) {
                Button("Terms") {
                    if let url = URL(string: "https://ration.mayutic.com/legal/terms") {
                        openURL(url)
                    }
                }
                Button("Privacy") {
                    if let url = URL(string: "https://ration.mayutic.com/legal/privacy") {
                        openURL(url)
                    }
                }
            }
            .font(Typography.caption())
            .foregroundStyle(Theme.hyperGreen)
        }
    }

    private func activeSubscriberCard(_ status: BillingStatus) -> some View {
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
    }

    private var subscriptionSection: some View {
        Group {
            if env.billing.subscriptionPackages.isEmpty {
                Text("Subscriptions load from RevenueCat offerings.").rationCaption()
            } else {
                Text("Crew Member").rationHeadline()
                ForEach(env.billing.subscriptionPackages) { pkg in
                    purchaseButton(pkg)
                }
            }
        }
    }

    private var creditPackSection: some View {
        Group {
            if !env.billing.creditPackages.isEmpty {
                Text("Credit packs").rationHeadline().frame(maxWidth: .infinity, alignment: .leading)
                Text("Consumable credits for AI scans. Credits do not expire.")
                    .rationCaption()
                    .frame(maxWidth: .infinity, alignment: .leading)
                ForEach(env.billing.creditPackages) { pkg in
                    purchaseButton(pkg)
                }
            }
        }
    }

    private func purchaseButton(_ pkg: BillingPackage) -> some View {
        Button {
            Task {
                await model.purchase(packageID: pkg.id, api: env.api, billing: env.billing)
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
            if let offeringsMessage = env.billing.offeringsMessage {
                return offeringsMessage
            }
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
