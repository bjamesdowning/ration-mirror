import SwiftUI

/// Horizontal capsule above the tab bar — thumb-zone primary actions.
struct FloatingActionBar: View {
    let actions: [FloatingAction]
    var hidden = false

    var body: some View {
        if !hidden, !actions.isEmpty {
            HStack(spacing: 8) {
                ForEach(actions) { action in
                    Button {
                        Haptics.light()
                        action.action()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: action.systemImage)
                                .font(.system(size: 16, weight: .semibold))
                            Text(action.label)
                                .font(Typography.caption())
                        }
                        .foregroundStyle(foreground(for: action))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .background(background(for: action))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .disabled(action.disabled)
                    .opacity(action.disabled ? 0.5 : 1)
                    .accessibilityLabel(action.label)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(Theme.platinum, lineWidth: 1))
            .shadow(color: Theme.carbon.opacity(0.12), radius: 12, y: 4)
            .padding(.bottom, 8)
        }
    }

    private func background(for action: FloatingAction) -> Color {
        if action.primary || action.variant == .primary { return Theme.hyperGreen }
        if action.variant == .danger { return Theme.danger.opacity(0.9) }
        return Theme.platinum
    }

    private func foreground(for action: FloatingAction) -> Color {
        if action.primary || action.variant == .primary { return .black }
        if action.variant == .danger { return .white }
        return Theme.carbon
    }
}
