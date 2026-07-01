import SwiftUI

/// Icon-only floating action control — text labels live in VoiceOver only.
struct IconFAB<MenuContent: View>: View {
    let systemImage: String
    let accessibilityLabel: String
    var isAI = false
    var disabled = false
    @ViewBuilder let menuContent: () -> MenuContent

    var body: some View {
        HStack {
            Spacer()
            Menu {
                menuContent()
            } label: {
                fabIcon
            }
            .disabled(disabled)
            .accessibilityLabel(accessibilityLabel)
            .padding(.trailing, 16)
            .padding(.bottom, 8)
        }
    }

    private var fabIcon: some View {
        Image(systemName: systemImage)
            .font(.system(size: 22, weight: .semibold))
            .foregroundStyle(isAI ? Color.black : Theme.carbon)
            .frame(width: 56, height: 56)
            .background(isAI ? Theme.hyperGreen : Color.clear, in: Circle())
            .background(.ultraThinMaterial, in: Circle())
            .overlay(Circle().stroke(isAI ? Theme.hyperGreen : Theme.platinum, lineWidth: 1))
    }
}

/// Detail screens use the same icon FAB menu pattern as list tabs.
typealias DetailActionFAB = IconFAB

/// Single-action icon FAB (no menu).
struct IconFABButton: View {
    let systemImage: String
    let accessibilityLabel: String
    var isAI = false
    var disabled = false
    let action: () -> Void

    var body: some View {
        HStack {
            Spacer()
            Button {
                Haptics.light()
                action()
            } label: {
                Image(systemName: systemImage)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(isAI ? Color.black : Theme.carbon)
                    .frame(width: 56, height: 56)
                    .background(isAI ? Theme.hyperGreen : Color.clear, in: Circle())
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(Circle().stroke(isAI ? Theme.hyperGreen : Theme.platinum, lineWidth: 1))
            }
            .disabled(disabled)
            .accessibilityLabel(accessibilityLabel)
            .padding(.trailing, 16)
            .padding(.bottom, 8)
        }
    }
}
