import SwiftUI
import Observation
import MarkdownUI
import UIKit

struct AskView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AskCoordinator.self) private var ask
    @Environment(\.dismiss) private var dismiss
    @State private var followsLatest = true
    @FocusState private var isComposerFocused: Bool
    @State private var showingPaywall = false
    @State private var transcriptCopied = false

    private var model: AskViewModel { ask.model }
    private var organizationId: String? { env.session.activeOrganizationId }
    private var isCopilotExhausted: Bool {
        CopilotAutoExpandPolicy.isCopilotExhausted(status: model.status)
    }
    private var isComposerBlocked: Bool {
        isCopilotExhausted
            || model.blocksComposerForSessionWarning
            || model.blocksComposerForBillingState
    }
    private var activityDisplay: CopilotActivityDisplay {
        model.activityDisplay
    }
    var body: some View {
        VStack(spacing: 0) {
            CopilotCompactHeader(
                status: model.status,
                sessionUsage: model.sessionUsage,
                onClose: closeSheet,
                onNewChat: startNewChat
            )
            if model.sessionUsage != nil || model.sessionLimitWarning != nil {
                CopilotSessionMeter(
                    usage: model.sessionUsage,
                    warning: model.sessionLimitWarning,
                    onAcknowledgeWarning: { model.acknowledgeSessionLimitWarning() },
                    onNewChat: startNewChat
                )
            }
            transcript
        }
        .background(Theme.ceramic.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 8) {
                if activityDisplay != .hidden {
                    CopilotActivityIndicator(display: activityDisplay)
                        .padding(.horizontal, 16)
                }
                CopilotModelPresetSelector(
                    selection: model.modelPreset,
                    isDisabled: model.isTurnActive || model.isStopping,
                    onSelect: { model.setModelPreset($0) }
                )
                .padding(.horizontal, 16)
                composer
                    .padding(.horizontal, 16)
            }
            .padding(.vertical, 8)
        }
        .task(id: env.session.orgGeneration) {
            guard let organizationId else { return }
            await ask.load(
                api: env.api,
                auth: env.auth,
                organizationId: organizationId,
                snapshots: env.snapshots
            )
        }
        .sheet(isPresented: $showingPaywall, onDismiss: {
            Task {
                guard let organizationId else { return }
                if let draft = await model.refreshStatusAfterCredits(
                    api: env.api,
                    auth: env.auth,
                    organizationId: organizationId,
                    snapshots: env.snapshots
                ) {
                    ask.draft = draft
                    isComposerFocused = true
                }
            }
        }) {
            PaywallView()
        }
    }

    private var transcript: some View {
        GeometryReader { _ in
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        if model.messages.isEmpty {
                            EmptyStateView(
                                icon: "sparkles",
                                title: "Ask Ration",
                                message: "Ask about the app, update Cargo, or inspect what is expiring. Scans, recipe generation, imports, and week planning stay in their native flows."
                            )
                            .padding(.top, 32)
                        }

                        ForEach(model.messages) { message in
                            MessageBubble(
                                message: message,
                                isStreaming: isStreamingBubble(message)
                            )
                            .id(message.id)
                        }

                        stateCard

                        Color.clear
                            .frame(height: 1)
                            .id("copilot-transcript-bottom")
                    }
                    .padding(16)
                    .background {
                        CopilotTranscriptScrollObserver { distance in
                            followsLatest = distance < 48
                        }
                    }
                }
                .scrollDismissesKeyboard(.interactively)
                .overlay(alignment: .bottomTrailing) {
                    if !followsLatest, !model.messages.isEmpty {
                        Button {
                            followsLatest = true
                            scrollToBottom(proxy: proxy, force: true)
                        } label: {
                            Label("Jump to latest", systemImage: "arrow.down")
                                .rationCaption()
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .rationAdaptiveMaterial(in: Capsule())
                        }
                        .foregroundStyle(Theme.carbon)
                        .padding(16)
                        .accessibilityLabel("Jump to latest Copilot message")
                    }
                }
                .onChange(of: model.streamingContentLength) { _, _ in
                    scrollToBottom(proxy: proxy)
                }
                .onChange(of: model.messages.count) { _, _ in
                    scrollToBottom(proxy: proxy)
                }
                .onChange(of: model.turnPhase) { _, _ in
                    scrollToBottom(proxy: proxy)
                }
                .onChange(of: model.activeTool?.toolCallId) { _, _ in
                    scrollToBottom(proxy: proxy)
                }
                .onChange(of: model.completedTool) { _, _ in
                    scrollToBottom(proxy: proxy)
                }
            }
        }
    }

    private func closeSheet() {
        isComposerFocused = false
        ask.closeSheet()
        dismiss()
    }

    private func startNewChat() {
        guard let organizationId else { return }
        followsLatest = true
        ask.draft = ""
        model.newChat(
            auth: env.auth,
            organizationId: organizationId,
            snapshots: env.snapshots
        )
        Haptics.light()
    }

    private func continueInNewChat() {
        guard let organizationId else { return }
        followsLatest = true
        transcriptCopied = false
        model.newChat(
            auth: env.auth,
            organizationId: organizationId,
            snapshots: env.snapshots
        )
        ask.draft = CopilotContinuationCopy.continuationDraft()
        isComposerFocused = true
        Haptics.light()
    }

    private func copyTranscript() {
        let text = CopilotContinuationCopy.transcriptForCopy(model.messages)
        guard !text.isEmpty else { return }
        UIPasteboard.general.string = text
        Haptics.light()
    }

    private func scrollToBottom(proxy: ScrollViewProxy, force: Bool = false) {
        guard followsLatest || force else { return }
        withAnimation(.easeOut(duration: 0.2)) {
            proxy.scrollTo("copilot-transcript-bottom", anchor: .bottom)
        }
    }

    private func isStreamingBubble(_ message: CopilotMessage) -> Bool {
        guard message.role == "assistant" else { return false }
        return model.turnPhase == .streaming && message.id == model.messages.last?.id
    }

    @ViewBuilder
    private var stateCard: some View {
        switch model.state {
        case .connecting:
            GlassCard {
                HStack {
                    ProgressView().tint(Theme.hyperGreen)
                    Text("Linking to Ration Copilot…").rationCaption()
                }
            }
        case let .awaitingApproval(id, title, description):
            ConfirmCard(
                title: title,
                description: description,
                isLocked: model.isStopping || !model.isAwaitingApproval
            ) {
                Task { await model.approve(id, approved: true) }
            } onDeny: {
                Task { await model.approve(id, approved: false) }
            }
        case let .blocked(blocked):
            BlockedFeatureCard(blocked: blocked)
        case let .allowanceExhausted(message):
            CreditCard(message: message) {
                Task { await model.enableAutoDeduct(api: env.api) }
            }
        case let .insufficientCredits(message):
            GlassCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Copilot needs more credits").rationHeadline()
                    Text(message).rationCaption()
                    HStack(spacing: 10) {
                        Button("Add credits") { showingPaywall = true }
                            .buttonStyle(PrimaryButtonStyle())
                        Button("New chat") { startNewChat() }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                }
            }
        case let .sessionLimitReached(message):
            GlassCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Start a new chat to continue").rationHeadline()
                    Text(message).rationCaption()
                    Text("Your conversation stays below. Continue in a fresh chat and add what you still need help with.")
                        .rationCaption()
                    Button("Continue in new chat") { continueInNewChat() }
                        .buttonStyle(PrimaryButtonStyle())
                    Button(transcriptCopied ? "Copied" : "Copy transcript") {
                        copyTranscript()
                        transcriptCopied = true
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            }
        case let .error(message):
            ErrorBanner(message: message)
        case .streaming, .idle:
            EmptyView()
        }
    }

    private var composer: some View {
        CopilotComposerBar(
            draft: Binding(
                get: { ask.draft },
                set: { ask.draft = $0 }
            ),
            isFocused: $isComposerFocused,
            mode: .sheet,
            isExhausted: isComposerBlocked,
            isTurnActive: model.isTurnActive,
            isStopping: model.isStopping,
            isAwaitingApproval: model.isAwaitingApproval,
            onFocusChange: { _ in },
            onDismissKeyboard: {
                isComposerFocused = false
            },
            onOpenSheet: {},
            onSend: { text in
                guard let organizationId else { return false }
                followsLatest = true
                let accepted = await ask.sendFromSheet(
                    text,
                    api: env.api,
                    auth: env.auth,
                    organizationId: organizationId,
                    snapshots: env.snapshots
                )
                if accepted {
                    Haptics.light()
                }
                return accepted
            },
            onStop: { await model.stop() },
            onExhaustedTap: {}
        )
    }
}

private struct MessageBubble: View {
    let message: CopilotMessage
    let isStreaming: Bool
    private var isUser: Bool { message.role == "user" }

    var body: some View {
        Group {
            if isUser {
                HStack {
                    Spacer(minLength: 48)
                    Text(message.content)
                        .font(Typography.body())
                        .foregroundStyle(Theme.carbon)
                        .textSelection(.enabled)
                        .padding(12)
                        .background(Theme.hyperGreen)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .contextMenu {
                            if !message.content.isEmpty {
                                Button("Copy") {
                                    UIPasteboard.general.string = message.content
                                }
                            }
                        }
                }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    CopilotReasoningBlock(
                        reasoning: message.reasoning,
                        reasoningState: message.reasoningState
                    )
                    HStack(alignment: .bottom, spacing: 4) {
                        MarkdownText(markdown: message.content.isEmpty ? " " : message.content)
                            .contextMenu {
                                if !message.content.isEmpty {
                                    Button("Copy") {
                                        UIPasteboard.general.string = message.content
                                    }
                                }
                            }
                        if isStreaming {
                            CopilotStreamingCursor()
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 8)
            }
        }
        .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
    }
}

private struct CopilotStreamingCursor: View {
    @State private var visible = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Circle()
            .fill(Theme.hyperGreen)
            .frame(width: 8, height: 8)
            .opacity(reduceMotion ? 1 : (visible ? 1 : 0.2))
            .animation(MotionPolicy.repeatingPulse(duration: 0.8), value: visible)
            .onAppear { if !reduceMotion { visible = false } }
    }
}

private struct MarkdownText: View {
    let markdown: String

    var body: some View {
        Markdown(markdown)
            .markdownTextStyle {
                FontFamily(.system())
                ForegroundColor(Theme.carbon)
            }
            .textSelection(.enabled)
    }
}

private struct ConfirmCard: View {
    let title: String
    let description: String
    let isLocked: Bool
    let onApprove: () -> Void
    let onDeny: () -> Void

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text(title).rationHeadline()
                Text(description).rationCaption()
                HStack {
                    Button("Cancel", action: onDeny)
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(isLocked)
                    Button("Confirm", action: onApprove)
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(isLocked)
                }
            }
        }
    }
}

private struct BlockedFeatureCard: View {
    let blocked: CopilotBlockedFeature

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Open the native flow").rationHeadline()
                Text(blocked.message).rationCaption()
                if let url = URL(string: blocked.deepLink) {
                    Link("Continue", destination: url)
                        .buttonStyle(PrimaryButtonStyle())
                }
            }
        }
    }
}

private struct CreditCard: View {
    let message: String
    let onEnable: () -> Void

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Credits needed").rationHeadline()
                Text(message).rationCaption()
                Button("Allow credit use", action: onEnable)
                    .buttonStyle(PrimaryButtonStyle())
            }
        }
    }
}
