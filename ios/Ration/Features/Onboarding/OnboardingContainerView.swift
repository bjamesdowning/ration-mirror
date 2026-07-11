import SwiftUI

/// Orchestrates welcome (0), contextual overlay (1–5), and launch (6) onboarding phases.
struct OnboardingContainerView: View {
    @Environment(AppEnvironment.self) private var env
    @Bindable var coordinator: OnboardingCoordinator
    @Binding var selectedTab: Int
    @Binding var showingGroupSettings: Bool
    @Binding var showingPaywall: Bool
    let onFinished: () -> Void

    var body: some View {
        ZStack {
            if coordinator.isContextualPhase {
                OnboardingOverlay(
                    coordinator: coordinator,
                    highlightedTab: coordinator.highlightedTab,
                    onBack: { Task { await goBackTour() } },
                    onNext: { Task { await advanceTour() } },
                    onSkip: { Task { await skipTour() } }
                )
            }
        }
        .fullScreenCover(isPresented: welcomePresented) {
            NavigationStack {
                OnboardingWelcomeView(
                    coordinator: coordinator,
                    onBeginTour: { Task { await beginTour() } },
                    onSkip: { Task { await skipTour() } }
                )
                .navigationTitle("Welcome")
                .navigationBarTitleDisplayMode(.inline)
            }
            .interactiveDismissDisabled(true)
        }
        .fullScreenCover(isPresented: launchPresented) {
            NavigationStack {
                OnboardingLaunchView(
                    coordinator: coordinator,
                    onComplete: { Task { await completeTour() } },
                    onBack: { Task { await goBackTour() } },
                    onSkip: { Task { await skipTour() } },
                    onViewPricing: {
                        showingPaywall = true
                    }
                )
                .navigationTitle("Mission Ready")
                .navigationBarTitleDisplayMode(.inline)
            }
            .interactiveDismissDisabled(true)
        }
        .onChange(of: coordinator.step) { _, step in
            applyRouting(for: step)
        }
        .onAppear {
            applyRouting(for: coordinator.step)
        }
    }

    private var welcomePresented: Binding<Bool> {
        Binding(
            get: { coordinator.isActive && coordinator.phase == .welcome },
            set: { _ in }
        )
    }

    private var launchPresented: Binding<Bool> {
        Binding(
            get: { coordinator.isActive && coordinator.phase == .launch },
            set: { _ in }
        )
    }

    private func applyRouting(for step: Int) {
        if let tab = OnboardingCopy.highlightedTab(for: step) {
            selectedTab = tab
        }
        if OnboardingCopy.shouldOpenGroupSettings(for: step) {
            showingGroupSettings = true
        } else if step != 1 {
            showingGroupSettings = false
        }
    }

    private func beginTour() async {
        if let settings = await coordinator.beginTour(api: env.api) {
            applySettings(settings)
        }
    }

    private func advanceTour() async {
        if let settings = await coordinator.advance(api: env.api) {
            applySettings(settings)
        }
    }

    private func goBackTour() async {
        if let settings = await coordinator.goBack(api: env.api) {
            applySettings(settings)
        }
    }

    private func skipTour() async {
        guard let settings = await coordinator.skip(api: env.api) else { return }
        applySettings(settings)
        showingGroupSettings = false
        onFinished()
    }

    private func completeTour() async {
        guard let settings = await coordinator.complete(api: env.api) else { return }
        applySettings(settings)
        showingGroupSettings = false
        onFinished()
    }

    private func applySettings(_ settings: UserSettings) {
        env.launch.updateUserSettings(settings)
        env.unitDisplayMode.syncFromServer(settings)
    }
}
