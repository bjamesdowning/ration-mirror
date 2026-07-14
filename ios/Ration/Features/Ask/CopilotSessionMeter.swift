import SwiftUI

struct CopilotSessionMeter: View {
    let usage: CopilotSessionUsage?
    let warning: CopilotSessionLimitWarning?
    let onAcknowledgeWarning: () -> Void
    let onNewChat: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let warning {
                warningBanner(warning)
            }

            if let usage {
                HStack(spacing: 8) {
                    Text("~\(formatTokens(usage.totalTokens)) / \(formatTokens(usage.maxTokens))")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)

                    Spacer(minLength: 4)

                    Text("\(usage.creditsCharged) cr this chat")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.hyperGreen)
                        .lineLimit(1)
                }

                ProgressView(value: Double(usage.totalTokens), total: Double(max(usage.maxTokens, 1)))
                    .tint(Theme.hyperGreen)
                    .accessibilityLabel("Copilot session token usage")

                if let nextCreditAt = usage.nextCreditAt {
                    Text("Next credit in ~\(formatTokens(nextCreditAt)) tokens")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background {
            RationAdaptiveMaterial(shape: AnyShape(Rectangle()))
        }
    }

    @ViewBuilder
    private func warningBanner(_ warning: CopilotSessionLimitWarning) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(warning.message)
                .font(Typography.caption())
                .foregroundStyle(warning.isUrgent ? Color.orange : Theme.muted)

            if warning.isUrgent {
                HStack(spacing: 8) {
                    Button("Continue anyway", action: onAcknowledgeWarning)
                        .buttonStyle(SecondaryButtonStyle())
                    Button("New chat", action: onNewChat)
                        .buttonStyle(PrimaryButtonStyle())
                }
            }
        }
    }

    private func formatTokens(_ count: Int) -> String {
        if count >= 10_000 {
            return "\(Int((Double(count) / 1000).rounded()))k"
        }
        return count.formatted()
    }
}
