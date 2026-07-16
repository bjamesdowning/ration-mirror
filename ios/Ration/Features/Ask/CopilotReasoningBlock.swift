import SwiftUI
import UIKit

struct CopilotReasoningBlock: View {
    let reasoning: String?
    let reasoningState: String?
    @State private var expanded = false

    private var hasReasoning: Bool {
        !(reasoning?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }

    var body: some View {
        if hasReasoning || reasoningState == "streaming" {
            VStack(alignment: .leading, spacing: 8) {
                Button {
                    expanded.toggle()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .rotationEffect(.degrees(expanded ? 180 : 0))
                            .opacity(reasoningState == "streaming" ? 0.7 : 1)
                        Text(reasoningState == "streaming" ? "Thinking…" : "Show thinking")
                            .font(Typography.caption())
                            .foregroundStyle(Theme.muted)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(reasoningState == "streaming" ? "Thinking, collapsed" : "Show thinking")

                if expanded, hasReasoning {
                    ScrollView {
                        Text(reasoning ?? "")
                            .font(.system(.caption2, design: .monospaced))
                            .foregroundStyle(Theme.muted)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 160)
                    .contextMenu {
                        if let reasoning, !reasoning.isEmpty {
                            Button("Copy") {
                                UIPasteboard.general.string = reasoning
                            }
                        }
                    }
                }
            }
            .padding(.bottom, 8)
        }
    }
}
