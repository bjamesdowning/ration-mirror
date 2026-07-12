import SwiftUI
import MarkdownUI

/// Full-screen Ask-first onboarding: one briefing response, navigation chips, Enter Ration.
struct OnboardingBriefingView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AskCoordinator.self) private var ask
    @State private var followsLatest = true
    @State private var showingPaywall = false
    @State private var didBootstrap = false

    private var model: AskViewModel { ask.model }

    var body: some View {
        VStack(spacing: 0) {
            briefingHeader
            transcript
        }
        .background(Theme.ceramic.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 12) {
                if model.briefingComplete || env.onboarding.isStaticReplay {
                    navigationChips
                }
                if activityDisplay != .hidden {
                    CopilotActivityIndicator(display: activityDisplay)
                        .padding(.horizontal, 16)
                }
                composer
                    .padding(.horizontal, 16)
            }
            .padding(.vertical, 8)
        }
        .sheet(isPresented: $showingPaywall) {
            PaywallView()
        }
        .task(id: bootstrapTaskKey) {
            await runBootstrapIfNeeded()
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
                Task { await enterRation() }
            } label: {
                if env.onboarding.isSaving {
                    ProgressView().tint(Theme.hyperGreen)
                } else {
                    Text(OnboardingBriefingCopy.enterRationTitle)
                        .font(Typography.caption())
                        .fontWeight(.semibold)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.hyperGreen)
            .disabled(env.onboarding.isSaving || model.isTurnActive)
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
                    if model.messages.isEmpty, !env.onboarding.isStaticReplay {
                        EmptyStateView(
                            icon: "sparkles",
                            title: "Welcome briefing",
                            message: "Ration Copilot will explain how the app works — one quick overview, then you're in."
                        )
                        .padding(.top, 32)
                    }

                    ForEach(model.messages) { message in
                        BriefingMessageBubble(
                            message: message,
                            isStreaming: isStreamingBubble(message)
                        )
                        .id(message.id)
                    }

                    briefingStateCard

                    Color.clear
                        .frame(height: 1)
                        .id("briefing-transcript-bottom")
                }
                .padding(16)
            }
            .onChange(of: model.streamingContentLength) { _, _ in
                scrollToBottom(proxy: proxy)
            }
            .onChange(of: model.messages.count) { _, _ in
                scrollToBottom(proxy: proxy)
            }
        }
    }

    @ViewBuilder
    private var briefingStateCard: some View {
        switch model.state {
        case .connecting:
            GlassCard {
                HStack {
                    ProgressView().tint(Theme.hyperGreen)
                    Text("Linking to Ration Copilot…").rationCaption()
                }
            }
        case let .error(message):
            ErrorBanner(message: message)
        default:
            EmptyView()
        }
    }

    private var navigationChips: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Next steps")
                .rationCaption()
                .foregroundStyle(Theme.muted)
                .padding(.horizontal, 4)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    BriefingChip(title: "Add first item", systemImage: "plus.circle") {
                        await enterRation(openCargo: true)
                    }
                    BriefingChip(title: "How credits work", systemImage: "creditcard") {
                        showingPaywall = true
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
            mode: .sheet,
            isExhausted: true,
            isTurnActive: model.isTurnActive,
            isStopping: model.isStopping,
            isAwaitingApproval: false,
            focusToken: 0,
            dismissToken: 0,
            onFocusChange: { _ in },
            onDismissKeyboard: {},
            onOpenSheet: {},
            onSend: { _ in false },
            onStop: {},
            onExhaustedTap: { showingPaywall = true },
            placeholderOverride: OnboardingBriefingCopy.composerLockedPlaceholder
        )
        .allowsHitTesting(false)
        .opacity(model.briefingComplete || env.onboarding.isStaticReplay ? 1 : 0.6)
    }

    private func isStreamingBubble(_ message: CopilotMessage) -> Bool {
        guard message.role == "assistant" else { return false }
        return model.turnPhase == .streaming && message.id == model.messages.last?.id
    }

    private func scrollToBottom(proxy: ScrollViewProxy) {
        guard followsLatest else { return }
        withAnimation(.easeOut(duration: 0.2)) {
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

        if model.status?.onboardingBriefingEligible == true {
            didBootstrap = true
            _ = await ask.sendOnboardingBootstrap(
                api: env.api,
                auth: env.auth,
                organizationId: organizationId,
                snapshots: env.snapshots
            )
        } else {
            didBootstrap = true
            model.showStaticBriefing(OnboardingBriefingCopy.staticReplayMarkdown)
        }
    }

    private func enterRation(openCargo: Bool = false) async {
        guard let settings = await env.onboarding.complete(api: env.api) else { return }
        env.launch.updateUserSettings(settings)
        env.onboarding.reset()
        ask.isOnboardingBriefing = false
        ask.model.resetBriefingSession()
        Haptics.success()
        if openCargo {
            env.deepLinkRouter.enqueue(.cargo)
        }
    }
}

private struct BriefingMessageBubble: View {
    let message: CopilotMessage
    let isStreaming: Bool

    var body: some View {
        if message.role == "user" {
            HStack {
                Spacer(minLength: 48)
                Text(message.content)
                    .font(Typography.body())
                    .foregroundStyle(Theme.carbon)
                    .padding(12)
                    .background(Theme.hyperGreen)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        } else {
            HStack(alignment: .bottom, spacing: 4) {
                Markdown(message.content.isEmpty ? " " : message.content)
                    .markdownTextStyle {
                        FontFamily(.system())
                        ForegroundColor(Theme.carbon)
                    }
                if isStreaming {
                    Circle()
                        .fill(Theme.hyperGreen)
                        .frame(width: 8, height: 8)
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
    }
}
