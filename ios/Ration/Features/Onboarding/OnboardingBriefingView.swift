import SwiftUI

enum OnboardingBriefingPhase: Equatable {
    case connecting
    case streamingIntro
    case seedReady
    case seeding
    case seedComplete
    case staticReplay
}

/// Full-screen Ask-first onboarding: intro turn, optional starter seed, Get Started.
struct OnboardingBriefingView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AskCoordinator.self) private var ask
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var followsLatest = true
    @State private var didBootstrap = false
    @State private var showSeedSuccessToast = false
    @State private var seedPromptRevealed = false
    @State private var seedRevealTask: Task<Void, Never>?
    @FocusState private var isComposerFocused: Bool

    private var model: AskViewModel { ask.model }

    /// Seed CTA only after a successful intro reply has finished and the UI has settled.
    private var canRevealSeedPrompt: Bool {
        phase == .seedReady
            && !model.isTurnActive
            && model.liveBriefingActive
            && model.introSucceeded
    }

    private var phase: OnboardingBriefingPhase {
        if env.onboarding.isStaticReplay { return .staticReplay }
        if model.seedComplete { return .seedComplete }
        if model.isTurnActive, model.seedTurnStarted { return .seeding }
        if model.introSucceeded, model.liveBriefingActive, !model.seedComplete {
            return .seedReady
        }
        if model.introComplete, !model.introSucceeded { return .streamingIntro }
        if model.introComplete { return .staticReplay }
        if model.isTurnActive || !model.messages.isEmpty { return .streamingIntro }
        return .connecting
    }

    private var canGetStarted: Bool {
        // Escape hatch after any progress, error, or static replay — including mid-seed / intro timeout.
        if env.onboarding.isSaving { return false }
        if env.onboarding.isStaticReplay || model.introComplete || !model.messages.isEmpty {
            return true
        }
        if case .error = model.state { return true }
        return false
    }

    private var seedCardState: StarterSeedCardState {
        if model.seedComplete { return .completed }
        if !model.liveBriefingActive { return .disabled }
        if phase == .seeding { return .loading }
        if canRevealSeedPrompt, seedPromptRevealed { return .idle }
        return .disabled
    }

    var body: some View {
        VStack(spacing: 0) {
            briefingHeader
            transcript
        }
        .background(Theme.ceramic.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            bottomInset
        }
        .overlay(alignment: .bottom) {
            if showSeedSuccessToast {
                TransientSuccessToast(message: model.seedSuccessMessage) {
                    withAnimation(MotionPolicy.shortFade) {
                        showSeedSuccessToast = false
                    }
                }
                .padding(.bottom, 96)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .accessibilityAddTraits(.isStaticText)
            }
        }
        .animation(MotionPolicy.dockSpring, value: phase)
        .animation(MotionPolicy.shortFade, value: showSeedSuccessToast)
        .animation(MotionPolicy.dockSpring, value: seedPromptRevealed)
        .task(id: bootstrapTaskKey) {
            await runBootstrapIfNeeded()
        }
        .onChange(of: model.seedComplete) { _, complete in
            guard complete else { return }
            Haptics.success()
            withAnimation(MotionPolicy.dockSpring) {
                showSeedSuccessToast = true
            }
        }
        .onChange(of: canRevealSeedPrompt) { _, ready in
            if ready {
                scheduleSeedPromptReveal()
            }
        }
        .onChange(of: phase) { _, next in
            switch next {
            case .connecting, .streamingIntro, .staticReplay:
                seedRevealTask?.cancel()
                seedPromptRevealed = false
            default:
                break
            }
        }
        .onDisappear {
            seedRevealTask?.cancel()
        }
    }

    private var bootstrapTaskKey: String {
        let org = env.session.activeOrganizationId ?? "nil"
        return "\(org)-\(env.onboarding.isStaticReplay)-\(env.launch.startupGeneration)"
    }

    private var activityDisplay: CopilotActivityDisplay {
        model.activityDisplay
    }

    private var briefingHeader: some View {
        HStack(spacing: 12) {
            Label("Ask Ration", systemImage: "sparkles")
                .font(Typography.headline())
                .foregroundStyle(Theme.carbon)
                .lineLimit(1)

            Spacer(minLength: 4)

            Button {
                Task { await enterRation(openCargo: model.seedComplete) }
            } label: {
                if env.onboarding.isSaving {
                    ProgressView().tint(Theme.onHyperGreen)
                } else {
                    Text(OnboardingBriefingCopy.getStartedTitle)
                        .font(Typography.caption())
                        .fontWeight(.semibold)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.hyperGreen)
            .disabled(!canGetStarted || env.onboarding.isSaving)
            .opacity(canGetStarted ? 1 : 0.55)
            .scaleEffect(canGetStarted && !reduceMotion ? 1 : 0.98)
            .animation(MotionPolicy.dockSpring, value: canGetStarted)
            .accessibilityLabel(OnboardingBriefingCopy.getStartedTitle)
            .accessibilityHint(
                model.seedComplete
                    ? "Enter Ration and open Cargo"
                    : "Enter Ration and explore the app"
            )
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background {
            RationAdaptiveMaterial(shape: AnyShape(Rectangle()))
        }
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    if model.messages.isEmpty, phase == .connecting {
                        connectingCard
                            .padding(.top, 32)
                            .transition(.opacity)
                    } else if model.messages.isEmpty, !env.onboarding.isStaticReplay {
                        EmptyStateView(
                            icon: "sparkles",
                            title: OnboardingBriefingCopy.emptyStateTitle,
                            message: OnboardingBriefingCopy.emptyStateMessage
                        )
                        .padding(.top, 32)
                    }

                    ForEach(model.messages) { message in
                        BriefingMessageBubble(
                            message: message,
                            isStreaming: isStreamingBubble(message)
                        )
                        .id(message.id)
                        .transition(
                            .asymmetric(
                                insertion: .move(edge: .bottom).combined(with: .opacity),
                                removal: .opacity
                            )
                        )
                    }

                    if shouldShowSeedPromptInTranscript {
                        StarterSeedCard(
                            state: seedCardState,
                            promptPreview: OnboardingBriefingCopy.seedPrompt
                        ) {
                            Task { await runSeed() }
                        }
                        .id("briefing-seed-prompt")
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                        .accessibilitySortPriority(10)
                    }

                    briefingStateCard

                    if case let .error(message) = model.state {
                        briefingErrorRecovery(message: message)
                    }

                    Color.clear
                        .frame(height: 1)
                        .id("briefing-transcript-bottom")
                }
                .padding(16)
                .animation(MotionPolicy.dockSpring, value: model.messages.count)
                .animation(MotionPolicy.dockSpring, value: seedPromptRevealed)
            }
            .onChange(of: model.streamingContentLength) { _, _ in
                scrollToBottom(proxy: proxy)
            }
            .onChange(of: model.messages.count) { _, _ in
                scrollToBottom(proxy: proxy)
            }
            .onChange(of: seedPromptRevealed) { _, revealed in
                if revealed { scrollToBottom(proxy: proxy) }
            }
        }
    }

    private var connectingCard: some View {
        GlassCard {
            VStack(spacing: 14) {
                Image(systemName: "sparkles")
                    .font(Typography.heroIcon(28))
                    .foregroundStyle(Theme.hyperGreen)
                    .symbolEffect(
                        .pulse,
                        options: .repeating,
                        isActive: !reduceMotion
                    )
                Text(OnboardingBriefingCopy.connectingTitle)
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
                ProgressView().tint(Theme.hyperGreen)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        }
    }

    @ViewBuilder
    private var briefingStateCard: some View {
        switch model.state {
        case .connecting:
            connectingCard
        default:
            EmptyView()
        }
    }

    @ViewBuilder
    private func briefingErrorRecovery(message: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ErrorBanner(message: message)
            HStack(spacing: 8) {
                if !model.briefingComplete, !model.introSucceeded {
                    BriefingChip(title: OnboardingBriefingCopy.retryIntroTitle, systemImage: "arrow.clockwise") {
                        await retryIntro()
                    }
                } else if !model.briefingComplete, !model.seedComplete, model.introSucceeded {
                    BriefingChip(title: OnboardingBriefingCopy.retrySeedTitle, systemImage: "arrow.clockwise") {
                        await retrySeed()
                    }
                }
            }
        }
        .padding(.top, 4)
    }

    private var bottomInset: some View {
        VStack(spacing: 12) {
            if phase == .seedComplete || phase == .staticReplay {
                navigationChips
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            if activityDisplay != .hidden {
                CopilotActivityIndicator(display: activityDisplay)
                    .padding(.horizontal, 16)
                    .transition(.opacity)
            }

            composer
                .padding(.horizontal, 16)
        }
        .padding(.vertical, 8)
    }

    /// Inline after the intro reply — never a bottom-sheet that covers the transcript.
    private var shouldShowSeedPromptInTranscript: Bool {
        switch phase {
        case .seedReady:
            return seedPromptRevealed && model.liveBriefingActive
        case .seeding, .seedComplete:
            return model.liveBriefingActive
        case .staticReplay, .connecting, .streamingIntro:
            return false
        }
    }

    private var navigationChips: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(OnboardingBriefingCopy.fallbackNextStepsTitle)
                .rationCaption()
                .foregroundStyle(Theme.muted)
                .padding(.horizontal, 4)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    BriefingChip(title: OnboardingBriefingCopy.seeInCargoTitle, systemImage: "shippingbox") {
                        Haptics.light()
                        await enterRation(openCargo: true)
                    }
                    if phase == .staticReplay {
                        BriefingChip(title: OnboardingBriefingCopy.getStartedTitle, systemImage: "arrow.right.circle") {
                            await enterRation(openCargo: false)
                        }
                    }
                }
                .padding(.horizontal, 4)
            }
        }
        .padding(.horizontal, 12)
    }

    private var composer: some View {
        CopilotComposerBar(
            draft: .constant(""),
            isFocused: $isComposerFocused,
            mode: .sheet,
            isExhausted: true,
            isTurnActive: model.isTurnActive,
            isStopping: model.isStopping,
            isAwaitingApproval: false,
            onFocusChange: { _ in },
            onDismissKeyboard: { isComposerFocused = false },
            onOpenSheet: {},
            onSend: { _ in false },
            onStop: {
                await model.stop()
            },
            onExhaustedTap: {},
            placeholderOverride: OnboardingBriefingCopy.composerLockedPlaceholder
        )
        // Hit-test only while a turn is active so Stop works; otherwise lock the exhausted composer.
        .allowsHitTesting(model.isTurnActive)
        .opacity(model.introComplete || env.onboarding.isStaticReplay || model.isTurnActive ? 1 : 0.6)
    }

    private func scheduleSeedPromptReveal() {
        guard !seedPromptRevealed else { return }
        seedRevealTask?.cancel()
        seedRevealTask = Task { @MainActor in
            // Let the user finish reading the intro before offering the seed action.
            if !reduceMotion {
                try? await Task.sleep(for: .milliseconds(900))
            }
            guard !Task.isCancelled, canRevealSeedPrompt else { return }
            withAnimation(MotionPolicy.dockSpring) {
                seedPromptRevealed = true
            }
        }
    }

    private func isStreamingBubble(_ message: CopilotMessage) -> Bool {
        guard message.role == "assistant" else { return false }
        return model.turnPhase == .streaming && message.id == model.messages.last?.id
    }

    private func scrollToBottom(proxy: ScrollViewProxy) {
        guard followsLatest else { return }
        withAnimation(MotionPolicy.shortFade) {
            proxy.scrollTo("briefing-transcript-bottom", anchor: .bottom)
        }
    }

    private func runBootstrapIfNeeded() async {
        guard !didBootstrap else { return }
        guard let organizationId = env.session.activeOrganizationId else { return }

        if env.onboarding.isStaticReplay {
            didBootstrap = true
            model.showStaticBriefing(OnboardingBriefingCopy.staticReplayMarkdown)
            return
        }

        await ask.load(
            api: env.api,
            auth: env.auth,
            organizationId: organizationId,
            snapshots: env.snapshots
        )
        ask.isOnboardingBriefing = true
        // Always start briefing on a clean conversation so the free grant binds correctly.
        ask.model.newChat(
            auth: env.auth,
            organizationId: organizationId,
            snapshots: env.snapshots
        )

        if model.status?.canUseOnboardingBriefing == true {
            didBootstrap = true
            let sent = await ask.sendOnboardingBootstrap(
                api: env.api,
                auth: env.auth,
                organizationId: organizationId,
                snapshots: env.snapshots
            )
            if !sent {
                // Live send failed (network / gate) — keep onboarding useful with fallback + chips.
                model.showStaticBriefing(OnboardingBriefingCopy.staticReplayMarkdown)
            }
        } else {
            didBootstrap = true
            model.showStaticBriefing(OnboardingBriefingCopy.staticReplayMarkdown)
        }
    }

    private func runSeed() async {
        guard let organizationId = env.session.activeOrganizationId else { return }
        guard seedCardState == .idle else { return }
        let sent = await ask.sendOnboardingSeed(
            api: env.api,
            auth: env.auth,
            organizationId: organizationId,
            snapshots: env.snapshots
        )
        if !sent, case .error = model.state {
            return
        }
        if !sent {
            model.surfaceBriefingError(OnboardingBriefingCopy.seedSendFailedMessage)
        }
    }

    private func retryIntro() async {
        guard let organizationId = env.session.activeOrganizationId else { return }
        // Keep the existing conversationId — claimOnboardingBriefing rejects a second id
        // while the grant is still pending on the first conversation.
        model.prepareIntroRetry()
        let sent = await ask.sendOnboardingBootstrap(
            api: env.api,
            auth: env.auth,
            organizationId: organizationId,
            snapshots: env.snapshots
        )
        if !sent {
            model.surfaceBriefingError(OnboardingBriefingCopy.introRetryFailedMessage)
        }
    }

    private func retrySeed() async {
        model.prepareSeedRetry()
        await runSeed()
    }

    private func enterRation(openCargo: Bool = false) async {
        Haptics.success()
        if model.isTurnActive {
            await model.stop()
            // Don't wait forever on a hung cancel — hard-tear the turn so complete() always proceeds.
            if model.isTurnActive {
                model.forceEndBriefingTurn()
            }
        }
        let seeded = model.seedComplete
        let shouldOpenCargo = openCargo || seeded
        let organizationId = env.session.activeOrganizationId
        if shouldOpenCargo, let organizationId {
            await env.snapshots.clear(domain: SnapshotDomain.cargo, organizationId: organizationId)
        }
        guard let settings = await env.onboarding.complete(api: env.api) else { return }
        env.launch.updateUserSettings(settings)
        env.onboarding.reset()
        if let organizationId {
            ask.endOnboardingBriefing(
                auth: env.auth,
                organizationId: organizationId,
                snapshots: env.snapshots
            )
        } else {
            ask.isOnboardingBriefing = false
            ask.model.resetBriefingSession()
        }
        if shouldOpenCargo {
            env.deepLinkRouter.enqueue(.cargo)
        }
    }
}

private struct BriefingMessageBubble: View {
    let message: CopilotMessage
    let isStreaming: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulseDot = false

    var body: some View {
        if message.role == "user" {
            HStack {
                Spacer(minLength: 48)
                Text(message.content)
                    .font(Typography.body())
                    .foregroundStyle(Theme.carbon)
                    .textSelection(.enabled)
                    .padding(12)
                    .background(Theme.hyperGreen)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        } else {
            HStack(alignment: .bottom, spacing: 4) {
                CopilotStructuredText(markdown: message.content)
                if isStreaming {
                    Circle()
                        .fill(Theme.hyperGreen)
                        .frame(width: 8, height: 8)
                        .opacity(reduceMotion ? 1 : (pulseDot ? 1 : 0.35))
                        .onAppear { pulseDot = true }
                        .animation(
                            MotionPolicy.repeatingPulse(duration: 0.7),
                            value: pulseDot
                        )
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
        }
    }
}

private struct BriefingChip: View {
    let title: String
    let systemImage: String
    let action: () async -> Void

    var body: some View {
        Button {
            Task { await action() }
        } label: {
            Label(title, systemImage: systemImage)
                .font(Typography.caption())
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Theme.platinum)
                .clipShape(Capsule())
        }
        .foregroundStyle(Theme.carbon)
        .accessibilityLabel(title)
    }
}
