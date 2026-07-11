import SwiftUI

struct CopilotActivityIndicator: View {
    let display: CopilotActivityDisplay

    var body: some View {
        switch display {
        case .hidden:
            EmptyView()
        case .thinking:
            statusCard {
                ProgressView().tint(Theme.hyperGreen)
                Text("Copilot is thinking")
                    .rationHeadline()
                ThinkingDots()
            }
        case let .tool(label, running, succeeded):
            statusCard {
                if running {
                    ProgressView().tint(Theme.hyperGreen)
                } else if succeeded == false {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(Theme.warning)
                } else {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Theme.hyperGreen)
                }
                Text(label)
                    .rationHeadline()
            }
        }
    }

    @ViewBuilder
    private func statusCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 10) {
            content()
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Theme.hyperGreen.opacity(0.1))
        }
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Theme.hyperGreen.opacity(0.25), lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }
}

private struct ThinkingDots: View {
    @State private var phase = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(Theme.hyperGreen)
                    .frame(width: 5, height: 5)
                    .opacity(reduceMotion || phase == index ? 1 : 0.25)
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
