import SwiftUI

struct CopilotCompactHeader: View {
    let status: CopilotStatusResponse?
    let sessionUsage: CopilotSessionUsage?
    let onClose: () -> Void
    let onNewChat: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(Typography.heroIcon(16))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Done")

            Label("Ask Ration", systemImage: "sparkles")
                .font(Typography.headline())
                .foregroundStyle(Theme.carbon)
                .lineLimit(1)

            Spacer(minLength: 4)

            if let status {
                Text(statusSummary(status))
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .accessibilityLabel(statusAccessibilityLabel(status))
            }

            Button(action: onNewChat) {
                Image(systemName: "square.and.pencil")
                    .font(Typography.heroIcon(18))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("New Chat")
        }
        .foregroundStyle(Theme.carbon)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background {
            RationAdaptiveMaterial(shape: AnyShape(Rectangle()))
        }
    }

    private func statusSummary(_ status: CopilotStatusResponse) -> String {
        if let sessionUsage {
            return "~\(formatTokens(sessionUsage.totalTokens)) · \(sessionUsage.creditsCharged) cr"
        }
        if status.freeConversationsRemaining > 0 {
            return "\(status.freeConversationsRemaining) free · \(status.creditBalance) cr"
        }
        return "\(status.creditBalance) cr"
    }

    private func formatTokens(_ count: Int) -> String {
        if count >= 10_000 {
            return "\(Int((Double(count) / 1000).rounded()))k"
        }
        return count.formatted()
    }

    private func statusAccessibilityLabel(_ status: CopilotStatusResponse) -> String {
        "\(status.freeConversationsRemaining) free chats remaining, \(status.creditBalance) credits"
    }
}
