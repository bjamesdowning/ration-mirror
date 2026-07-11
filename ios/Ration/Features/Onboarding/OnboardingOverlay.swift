import SwiftUI

/// Scrim, tab highlight, and contextual step card during onboarding steps 1–5.
struct OnboardingOverlay: View {
    @Bindable var coordinator: OnboardingCoordinator
    let highlightedTab: Int?
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    private static let tabCount = 5
    /// Standard UITabBar content height (excluding home-indicator safe area).
    private static let tabBarContentHeight: CGFloat = 49

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                Color.black.opacity(0.12)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture {}
                    .accessibilityHidden(true)

                if let tab = highlightedTab {
                    TabHighlightIndicator(
                        tabIndex: tab,
                        tabCount: Self.tabCount,
                        centerY: tabIconCenterY(in: geo),
                        tabWidth: geo.size.width / CGFloat(Self.tabCount),
                        isPulsing: pulse && !reduceMotion
                    )
                }

                if let content = OnboardingCopy.contextualStep(for: coordinator.step) {
                    OnboardingStepCard(
                        step: coordinator.step,
                        content: content,
                        isSaving: coordinator.isSaving,
                        onBack: onBack,
                        onNext: onNext,
                        onSkip: onSkip
                    )
                    .padding(.horizontal, 12)
                    .padding(.bottom, cardBottomInset(in: geo))
                }
            }
        }
        .ignoresSafeArea()
        .transition(.opacity)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }

    private func tabIconCenterY(in geo: GeometryProxy) -> CGFloat {
        geo.size.height
            - geo.safeAreaInsets.bottom
            - (Self.tabBarContentHeight / 2)
    }

    private func cardBottomInset(in geo: GeometryProxy) -> CGFloat {
        geo.safeAreaInsets.bottom + Self.tabBarContentHeight + 8
    }
}

private struct TabHighlightIndicator: View {
    let tabIndex: Int
    let tabCount: Int
    let centerY: CGFloat
    let tabWidth: CGFloat
    let isPulsing: Bool

    var body: some View {
        Circle()
            .stroke(Theme.hyperGreen, lineWidth: isPulsing ? 3 : 2)
            .frame(width: isPulsing ? 52 : 44, height: isPulsing ? 52 : 44)
            .opacity(isPulsing ? 0.9 : 0.7)
            .position(
                x: tabWidth * (CGFloat(tabIndex) + 0.5),
                y: centerY
            )
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
