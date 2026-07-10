import SwiftUI
import Observation
import MarkdownUI

struct AskView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AskCoordinator.self) private var ask
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""
    @FocusState private var isComposerFocused: Bool

    private var model: AskViewModel { ask.model }
    private var organizationId: String? { env.session.activeOrganizationId }
    private var isCopilotExhausted: Bool {
        CopilotAutoExpandPolicy.isCopilotExhausted(status: model.status)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let status = model.status {
                    AllowanceMeter(status: status)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 12)
                }

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
                                MessageBubble(message: message, isStreaming: isStreamingBubble(message))
                                    .id(message.id)
                            }

                            if let tool = model.activeTool {
                                ToolStatusCard(status: tool, phase: .running)
                            } else if let completed = model.completedTool {
                                ToolStatusCard(
                                    status: CopilotToolStatus(
                                        toolCallId: completed.toolName,
                                        toolName: completed.toolName,
                                        label: completed.label
                                    ),
                                    phase: completed.succeeded ? .done : .error
                                )
                            }

                            if model.showsThinkingIndicator {
                                ThinkingIndicator()
                            }

                            stateCard
                        }
                        .padding(16)
                    }
                    .scrollDismissesKeyboard(.interactively)
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

                composer
                    .padding(16)
                    .background(.ultraThinMaterial)
            }
            .background(Theme.ceramic.ignoresSafeArea())
            .navigationTitle("Ask")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("New Chat") {
                        if let organizationId {
                            model.newChat(auth: env.auth, organizationId: organizationId, snapshots: env.snapshots)
                            Haptics.light()
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        ask.closeSheet()
                        dismiss()
                    }
                }
            }
            .task(id: env.session.orgGeneration) {
                guard let organizationId else { return }
                await ask.load(api: env.api, auth: env.auth, organizationId: organizationId, snapshots: env.snapshots)
            }
            .onDisappear {
                model.disconnect()
            }
        }
    }

    private func scrollToBottom(proxy: ScrollViewProxy) {
        if let last = model.messages.last {
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo(last.id, anchor: .bottom)
            }
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
            ConfirmCard(title: title, description: description) {
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
        case let .error(message):
            ErrorBanner(message: message)
        case .streaming, .idle:
            EmptyView()
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("Ask Ration…", text: $draft, axis: .vertical)
                .lineLimit(1...5)
                .textFieldStyle(.plain)
                .padding(12)
                .frame(minHeight: 44, maxHeight: 120, alignment: .topLeading)
                .background(Theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .focused($isComposerFocused)
                .disabled(isCopilotExhausted)
                .opacity(isCopilotExhausted ? 0.45 : 1)
                .onTapGesture {
                    isComposerFocused = true
                }

            Button {
                let text = draft
                draft = ""
                if let organizationId {
                    Task {
                        await ask.sendFromBar(text, api: env.api, auth: env.auth, organizationId: organizationId, snapshots: env.snapshots)
                    }
                    Haptics.light()
                }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 34))
                    .foregroundStyle(Theme.hyperGreen)
            }
            .disabled(isCopilotExhausted || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .opacity(isCopilotExhausted ? 0.45 : 1)
            .accessibilityLabel("Send message to Copilot")
        }
    }
}

private struct AllowanceMeter: View {
    let status: CopilotStatusResponse

    var body: some View {
        GlassCard {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Copilot allowance").rationCaption()
                    Text(status.freeConversationsRemaining > 0 ? "\(status.freeConversationsRemaining) free chats today" : "\(status.conversationFloorCost) credit floor per new chat")
                        .rationHeadline()
                }
                Spacer()
                Text("\(status.creditBalance) cr")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.hyperGreen)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Theme.hyperGreen.opacity(0.12))
                    .clipShape(Capsule())
            }
        }
    }
}

private struct MessageBubble: View {
    let message: CopilotMessage
    let isStreaming: Bool
    private var isUser: Bool { message.role == "user" }

    var body: some View {
        HStack {
            if isUser { Spacer(minLength: 48) }
            Group {
                if isUser {
                    Text(message.content)
                        .font(Typography.body())
                        .foregroundStyle(Theme.carbon)
                } else {
                    HStack(alignment: .bottom, spacing: 4) {
                        MarkdownText(markdown: message.content.isEmpty ? " " : message.content)
                        if isStreaming {
                            CopilotStreamingCursor()
                        }
                    }
                }
            }
            .padding(12)
            .background(isUser ? Theme.hyperGreen : Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            if !isUser { Spacer(minLength: 48) }
        }
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

private struct ThinkingIndicator: View {
    @State private var phase = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GlassCard {
            HStack(spacing: 10) {
                ProgressView().tint(Theme.hyperGreen)
                Text("Copilot is thinking")
                    .rationHeadline()
                if !reduceMotion {
                    HStack(spacing: 4) {
                        ForEach(0..<3, id: \.self) { index in
                            Circle()
                                .fill(Theme.hyperGreen)
                                .frame(width: 5, height: 5)
                                .opacity(phase == index ? 1 : 0.25)
                        }
                    }
                }
            }
        }
        .task {
            guard !reduceMotion else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 350_000_000)
                phase = (phase + 1) % 3
            }
        }
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
    }
}

private enum ToolCardPhase {
    case running
    case done
    case error
}

private struct ToolStatusCard: View {
    let status: CopilotToolStatus
    let phase: ToolCardPhase

    var body: some View {
        GlassCard {
            HStack {
                Group {
                    switch phase {
                    case .running:
                        ProgressView().tint(Theme.hyperGreen)
                    case .done:
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.hyperGreen)
                    case .error:
                        Image(systemName: "exclamationmark.circle.fill").foregroundStyle(Theme.warning)
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(status.label).rationHeadline()
                    Text(status.toolName).rationCaption()
                }
                Spacer()
            }
        }
    }
}

private struct ConfirmCard: View {
    let title: String
    let description: String
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
                    Button("Confirm", action: onApprove)
                        .buttonStyle(PrimaryButtonStyle())
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
