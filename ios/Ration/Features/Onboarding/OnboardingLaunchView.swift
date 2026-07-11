import SwiftUI
import UIKit

struct OnboardingLaunchView: View {
    @Bindable var coordinator: OnboardingCoordinator
    let onComplete: () -> Void
    let onBack: () -> Void
    let onSkip: () -> Void
    let onViewPricing: () -> Void
    @State private var celebrateScale: CGFloat = 1

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                creditsIntro
                voucherCard
                tierGrid
                TechInsightView(
                    text: "Your first Supply Run (\(OnboardingCopy.welcomePromoCredits) credits) is on us — use code \(OnboardingCopy.welcomePromoCode) with Supply Run only at checkout."
                )
                copilotNote

                if let errorMessage = coordinator.errorMessage {
                    ErrorBanner(message: errorMessage)
                }

                actions
            }
            .padding(24)
        }
        .background(Theme.ceramic)
        .scaleEffect(celebrateScale)
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark")
                .font(Typography.heroIcon(22, weight: .bold))
                .foregroundStyle(Theme.hyperGreen)
                .frame(width: 44, height: 44)
                .background(Theme.hyperGreen.opacity(0.2))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text("Mission ready.")
                    .rationTitle()
                Text("Tour complete")
                    .rationCaption()
            }
        }
    }

    private var creditsIntro: some View {
        Text("Scans and AI features use credits. Purchase as you go or upgrade to Crew Member for unlimited capacity.")
            .rationBody()
            .foregroundStyle(Theme.carbon.opacity(0.85))
            .fixedSize(horizontal: false, vertical: true)
    }

    private var voucherCard: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Free Supply Run — \(OnboardingCopy.welcomePromoCredits) credits")
                    .rationHeadline()
                Text("Use with Supply Run only at checkout to claim your first pack free.")
                    .rationCaption()
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Text(OnboardingCopy.welcomePromoCode)
                .font(Typography.mono(14, weight: .bold))
                .foregroundStyle(Theme.hyperGreen)
                .tracking(2)
        }
        .padding(16)
        .background(Theme.hyperGreen.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Theme.hyperGreen.opacity(0.3), lineWidth: 1)
        )
    }

    private var tierGrid: some View {
        HStack(alignment: .top, spacing: 12) {
            ForEach(OnboardingCopy.tiers) { tier in
                tierCard(tier)
            }
        }
    }

    private func tierCard(_ tier: OnboardingCopy.TierInfo) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(tier.name)
                .font(Typography.mono(12, weight: .bold))
                .foregroundStyle(tier.isHighlighted ? Theme.hyperGreen : Theme.carbon)

            ForEach(tier.features, id: \.self) { feature in
                HStack(alignment: .top, spacing: 6) {
                    Text("·")
                        .foregroundStyle(Theme.hyperGreen)
                    Text(feature)
                        .rationCaption()
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(tier.isHighlighted ? Theme.hyperGreen.opacity(0.05) : Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(tier.isHighlighted ? Theme.hyperGreen.opacity(0.4) : Theme.platinum, lineWidth: 1)
        )
    }

    private var copilotNote: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 6) {
                Label("Copilot", systemImage: "sparkles")
                    .font(Typography.headline())
                    .foregroundStyle(Theme.hyperGreen)
                Text("Ask questions or run actions from the bar at the bottom of any tab — your orbital assistant for Cargo, Galley, and more.")
                    .rationCaption()
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var actions: some View {
        HStack(spacing: 12) {
            Button("← Back", action: onBack)
                .buttonStyle(OnboardingSecondaryCompactButtonStyle())

            Button("View Pricing", action: onViewPricing)
                .buttonStyle(OnboardingSecondaryCompactButtonStyle())

            Spacer(minLength: 0)

            Button("Begin Mission") {
                triggerCelebration()
                onComplete()
            }
            .buttonStyle(OnboardingPrimaryCompactButtonStyle(isLoading: coordinator.isSaving))
            .disabled(coordinator.isSaving)
        }
    }

    private func triggerCelebration() {
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        withAnimation(.spring(response: 0.25, dampingFraction: 0.55)) {
            celebrateScale = 1.03
        }
        withAnimation(.spring(response: 0.35, dampingFraction: 0.7).delay(0.15)) {
            celebrateScale = 1
        }
    }
}
