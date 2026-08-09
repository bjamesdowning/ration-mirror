import SwiftUI
import StoreKit
import UIKit

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

                    if BillingOwnership.shouldShowCrewMarketing(
                        isPersonalCrewActive: env.session.isAccountCrewMember,
                        creditsTrigger: context.trigger == .credits
                    ) {
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
                        restoreAndDisclosure(status: nil)
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
                .accessibilityHidden(true)
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
                .accessibilityHidden(true)
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
                    Text(statusLabel(status))
                        .font(Typography.headline())
                        .foregroundStyle(status.isPersonalCrewActive ? Theme.hyperGreen : Theme.muted)
                        .multilineTextAlignment(.trailing)
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

    private func statusLabel(_ status: BillingStatus) -> String {
        guard status.isPersonalCrewActive else { return String(localized: "Inactive") }
        if status.isCancelAtPeriodEnd, let ends = formattedExpiry(status.entitlements.crew_member.expiresAt) {
            return String(localized: "Active until \(ends)")
        }
        if status.isCancelAtPeriodEnd {
            return String(localized: "Active · Cancelled")
        }
        return String(localized: "Active")
    }

    private func formattedExpiry(_ iso: String?) -> String? {
        guard let iso else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        guard let date = withFraction.date(from: iso) ?? plain.date(from: iso) else {
            return nil
        }
        return date.formatted(date: .abbreviated, time: .omitted)
    }

    @ViewBuilder
    private func offerings(_ status: BillingStatus) -> some View {
        if status.isPersonalCrewActive {
            VStack(spacing: 20) {
                activeSubscriberCard(status)
                creditPackSection
                restoreAndDisclosure(status: status)
            }
        } else if status.billingUnavailable {
            VStack(spacing: 20) {
                ErrorBanner(message: "Billing is temporarily unavailable. Please try again shortly.")
                restoreAndDisclosure(status: status)
            }
        } else if !status.canPurchaseSubscription {
            VStack(spacing: 20) {
                ErrorBanner(message: blockMessage(status.purchaseBlockReason))
                creditPackSection
                restoreAndDisclosure(status: status)
            }
        } else if context.prefersCrewFirst {
            VStack(spacing: 20) {
                subscriptionSection
                creditPackSection
                restoreAndDisclosure(status: status)
            }
        } else {
            VStack(spacing: 20) {
                creditPackSection
                subscriptionSection
                restoreAndDisclosure(status: status)
            }
        }
    }

    private func restoreAndDisclosure(status: BillingStatus?) -> some View {
        VStack(spacing: 12) {
            if shouldShowManageSubscription(status) {
                Button(String(localized: "Manage subscription")) {
                    Task { await openManageSubscriptions() }
                }
                .buttonStyle(SecondaryButtonStyle())
            }

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
                    openURL(AppConfig.termsURL)
                }
                Button("Privacy") {
                    openURL(AppConfig.privacyURL)
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
                if status.isCancelAtPeriodEnd {
                    Text("Cancelled — access continues").rationHeadline()
                    if isAppStoreManaged(status) {
                        if let ends = formattedExpiry(status.entitlements.crew_member.expiresAt) {
                            Text("Your Crew membership ends on \(ends). Use Manage subscription below to renew through Apple.")
                                .rationCaption()
                                .multilineTextAlignment(.center)
                        } else {
                            Text("Your Crew membership is set to end after the current period. Use Manage subscription below to renew through Apple.")
                                .rationCaption()
                                .multilineTextAlignment(.center)
                        }
                    } else if let ends = formattedExpiry(status.entitlements.crew_member.expiresAt) {
                        Text("Your Crew membership ends on \(ends). Manage renewal on the web at ration.mayutic.com → Settings.")
                            .rationCaption()
                            .multilineTextAlignment(.center)
                    } else {
                        Text("Your Crew membership is set to end after the current period. Manage renewal on the web at ration.mayutic.com → Settings.")
                            .rationCaption()
                            .multilineTextAlignment(.center)
                    }
                } else {
                    Text("You're a Crew Member").rationHeadline()
                    if isAppStoreManaged(status) {
                        Text("Use Manage subscription below to change or cancel through Apple.")
                            .rationCaption()
                            .multilineTextAlignment(.center)
                    } else {
                        Text("Your subscription is managed on the web. Open ration.mayutic.com → Settings in a browser to change or cancel. New iOS purchases use the App Store.")
                            .rationCaption()
                            .multilineTextAlignment(.center)
                    }
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
                    caption: "Auto-renewable subscriptions. Unlimited capacity and household features. Billed through the App Store — cancel anytime in Manage subscription."
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
            return "You already have an existing web subscription. Manage it on ration.mayutic.com in a browser."
        default:
            return reason ?? "Subscription purchase is not available right now."
        }
    }

    private func shouldShowManageSubscription(_ status: BillingStatus?) -> Bool {
        guard let status, status.isPersonalCrewActive else { return false }
        // Apple sheet only for genuine App Store Crew (allowlist).
        return isAppStoreManaged(status)
    }

    private func isAppStoreManaged(_ status: BillingStatus) -> Bool {
        let store = status.management.store?.lowercased()
        return store == "app_store" || store == "mac_app_store"
    }

    @MainActor
    private func openManageSubscriptions() async {
        if let windowScene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first
        {
            try? await AppStore.showManageSubscriptions(in: windowScene)
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
