import SwiftUI

/// Auto-dismissing success snackbar (~5s) with tap-to-dismiss. No undo affordance.
struct TransientSuccessToast: View {
    let message: String
    let onDismiss: () -> Void

    @State private var progress: Double = 1

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .stroke(Theme.platinum, lineWidth: 2)
                    .frame(width: 24, height: 24)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(Theme.hyperGreen, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                    .frame(width: 24, height: 24)
                    .rotationEffect(.degrees(-90))
            }
            .accessibilityHidden(true)

            Text(message)
                .rationBody()
                .lineLimit(2)

            Spacer(minLength: 8)

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
            .accessibilityLabel("Dismiss")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .shadow(color: Theme.carbon.opacity(0.08), radius: 8, y: 2)
        .padding(.horizontal, 16)
        .onAppear {
            withAnimation(.linear(duration: 5)) {
                progress = 0
            }
        }
        .task {
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            onDismiss()
        }
    }
}
