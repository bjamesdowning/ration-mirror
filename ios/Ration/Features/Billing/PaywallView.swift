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
            status = try await pollAfterFulfillment(
                api: api,
                baseline: baseline,
                creditPack: isCreditPack
            )
            _ = await session.load(api: api)
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
            status = try await pollAfterFulfillment(
                api: api,
                baseline: status,
                creditPack: false
            )
            _ = await session.load(api: api)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Polls billing status up to ~5s for RC webhook fulfillment.
    /// Subscriptions early-exit when `crew_member` is active; credit packs
    /// early-exit when org credits rise above the pre-purchase baseline.
    private func pollAfterFulfillment(
        api: RationAPI,
        baseline: BillingStatus?,
        creditPack: Bool
    ) async throws -> BillingStatus {
        var latest = try await api.billingStatus()
        for _ in 0..<4 {
            if fulfillmentVisible(latest, baseline: baseline, creditPack: creditPack) {
                break
            }
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            latest = try await api.billingStatus()
        }
        return latest
    }

    private func fulfillmentVisible(
        _ latest: BillingStatus,
        baseline: BillingStatus?,
        creditPack: Bool
    ) -> Bool {
        if creditPack {
            let before = baseline?.credits ?? 0
            return latest.credits > before
        }
        return latest.entitlements.crew_member.active
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
                VStack(spacing: 24) {
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
        VStack(spacing: 10) {
            Image(systemName: "bolt.shield.fill")
                .font(Typography.heroIcon(36))
                .foregroundStyle(Theme.hyperGreen)
            Text("Unlock Crew Member").rationTitle()
            Text("Higher inventory limits, AI scans, and smart logistics.")
                .rationCaption()
                .multilineTextAlignment(.center)
        }
        .padding(.bottom, 4)
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
            VStack(spacing: 20) {
                subscriptionSection
                creditPackSection

                Button(model.isRestoring ? "Restoring…" : "Restore purchases") {
                    Task {
                        await model.restore(
                            api: env.api,
                            billing: env.billing,
                            session: env.session
                        )
                    }
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
            Text("Subscriptions renew automatically through your Apple ID until cancelled at least 24 hours before the end of the current period. Manage or cancel in App Store account settings after purchase. List prices match your App Store region; sales tax may apply at checkout.")
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
        .padding(.top, 4)
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
        VStack(alignment: .leading, spacing: 10) {
            if env.billing.subscriptionPackages.isEmpty {
                Text("Subscriptions load from RevenueCat offerings.").rationCaption()
            } else {
                sectionHeader("Crew Member", caption: nil)
                ForEach(BillingProductCatalog.sorted(env.billing.subscriptionPackages)) { pkg in
                    purchaseRow(pkg, style: .primary)
                }
            }
        }
    }

    private var creditPackSection: some View {
        Group {
            if !env.billing.creditPackages.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    sectionHeader(
                        "Credit packs",
                        caption: "Consumable credits for AI scans. Credits do not expire."
                    )
                    ForEach(BillingProductCatalog.sorted(env.billing.creditPackages)) { pkg in
                        purchaseRow(pkg, style: .secondary)
                    }
                }
            }
        }
    }

    private func sectionHeader(_ title: String, caption: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).rationHeadline()
            if let caption {
                Text(caption).rationCaption()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }

    private func purchaseRow(_ pkg: BillingPackage, style: PaywallProductRow.Style) -> some View {
        let info = BillingProductCatalog.info(for: pkg.productIdentifier)
        return PaywallProductRow(
            title: info?.displayName ?? pkg.title,
            subtitle: info?.subtitle,
            price: pkg.priceString,
            badge: info?.badge,
            isPurchasing: model.purchasingPackageID == pkg.id,
            style: style
        ) {
            Task {
                await model.purchase(
                    packageID: pkg.id,
                    api: env.api,
                    billing: env.billing,
                    session: env.session
                )
            }
        }
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
