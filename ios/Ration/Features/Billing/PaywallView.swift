import SwiftUI

/// Crew Member + credit packs paywall (RevenueCat offering-driven).
struct PaywallView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var model = BillingViewModel()

    var context: PaywallContext = .settings()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    header

                    if let reasonTitle = context.reasonTitle {
                        contextualReason(title: reasonTitle, detail: context.reasonDetail)
                    }

                    if !env.session.isCrewMember || context.trigger == .credits {
                        crewBenefits
                        freeVsCrewComparison
                    }

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
            .navigationTitle(String(localized: "Crew Member"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Done")) { dismiss() }
                }
            }
        }
        .task { await model.load(api: env.api, billing: env.billing) }
    }

    private var header: some View {
        VStack(spacing: 10) {
            Image(systemName: context.trigger == .credits ? "bolt.fill" : "bolt.shield.fill")
                .font(Typography.heroIcon(36))
                .foregroundStyle(Theme.hyperGreen)
            Text(context.headline).rationTitle()
            Text(headerSubtitle)
                .rationCaption()
                .multilineTextAlignment(.center)
        }
        .padding(.bottom, 4)
    }

    private var headerSubtitle: String {
        switch context.trigger {
        case .credits:
            return "Buy credit packs anytime. Crew Member unlocks unlimited capacity and household features."
        case .capacity, .featureGate, .settings:
            return "Unlimited capacity, groups & invites. AI features use credits on Free and Crew."
        }
    }

    private func contextualReason(title: String, detail: String?) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(Typography.headline())
                    .foregroundStyle(Theme.carbon)
                if let detail {
                    Text(detail)
                        .rationCaption()
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var crewBenefits: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What Crew Member provides")
                .rationHeadline()
            VStack(alignment: .leading, spacing: 8) {
                benefitRow("Unlimited Cargo, Meals, and Supply lists")
                benefitRow("Up to \(TierLimits.crewMaxOwnedGroups) owned groups + member invites")
                benefitRow("Share Manifest & Supply via public links")
                benefitRow("1 free Ask Ration chat per group per day")
                benefitRow("AI scans still use credits (same packs on both tiers)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func benefitRow(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Theme.hyperGreen)
                .font(.system(size: 14))
                .padding(.top, 2)
            Text(text)
                .rationBody()
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var freeVsCrewComparison: some View {
        GlassCard {
            VStack(spacing: 0) {
                HStack {
                    Text("Feature")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("Free")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                        .frame(width: 56, alignment: .center)
                    Text("Crew")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.hyperGreen)
                        .frame(width: 72, alignment: .center)
                }
                .padding(.bottom, 8)

                comparisonRow("Cargo items", free: "\(TierLimits.freeMaxInventoryItems)", crew: "Unlimited")
                comparisonRow("Meals", free: "\(TierLimits.freeMaxMeals)", crew: "Unlimited")
                comparisonRow("Supply lists", free: "\(TierLimits.freeMaxGroceryLists)", crew: "Unlimited")
                comparisonRow("Owned groups", free: "\(TierLimits.freeMaxOwnedGroups)", crew: "\(TierLimits.crewMaxOwnedGroups)")
                comparisonRow("Invites & share links", free: "—", crew: "Yes")
            }
        }
    }

    private func comparisonRow(_ label: String, free: String, crew: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .rationBody()
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(free)
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
                .frame(width: 56, alignment: .center)
            Text(crew)
                .font(Typography.caption())
                .fontWeight(.semibold)
                .foregroundStyle(Theme.carbon)
                .frame(width: 72, alignment: .center)
        }
        .padding(.vertical, 6)
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
            creditPackSection
            restoreAndDisclosure
        } else if context.prefersCrewFirst {
            VStack(spacing: 20) {
                subscriptionSection
                creditPackSection
                restoreAndDisclosure
            }
        } else {
            VStack(spacing: 20) {
                creditPackSection
                subscriptionSection
                restoreAndDisclosure
            }
        }
    }

    private var restoreAndDisclosure: some View {
        VStack(spacing: 12) {
            Button(model.isRestoring ? "Restoring…" : String(localized: "Restore purchases")) {
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
                sectionHeader(
                    "Crew Member",
                    caption: "Unlimited capacity and household features. Billed through the App Store."
                )
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
                        caption: "Credits power AI features. Crew unlocks capacity & household features. Credits do not expire."
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
