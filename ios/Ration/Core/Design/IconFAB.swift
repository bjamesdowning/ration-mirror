import SwiftUI

/// Shared 56pt circular FAB chrome — used by dock-embedded and inset FAB wrappers.
struct IconFABIcon: View {
    let systemImage: String
    var isAI = false

    var body: some View {
        Image(systemName: systemImage)
            .font(Typography.heroIcon(22))
            .foregroundStyle(isAI ? Theme.onHyperGreen : Theme.carbon)
            .frame(width: CopilotDockLayout.fabSize, height: CopilotDockLayout.fabSize)
            .background(isAI ? Theme.hyperGreen : Color.clear, in: Circle())
            .rationAdaptiveMaterial(in: Circle())
            .overlay(Circle().stroke(isAI ? Theme.hyperGreen : Theme.platinum, lineWidth: 1))
    }
}

/// Menu FAB without positioning wrapper — for `CopilotBottomDock` embedding.
struct IconFABMenuCore<MenuContent: View>: View {
    let systemImage: String
    let accessibilityLabel: String
    var isAI = false
    var disabled = false
    @ViewBuilder let menuContent: () -> MenuContent

    var body: some View {
        Menu {
            menuContent()
        } label: {
            IconFABIcon(systemImage: systemImage, isAI: isAI)
        }
        .disabled(disabled)
        .accessibilityLabel(accessibilityLabel)
    }
}

/// Single-action FAB without positioning wrapper — for `CopilotBottomDock` embedding.
struct IconFABButtonCore: View {
    let systemImage: String
    let accessibilityLabel: String
    var isAI = false
    var disabled = false
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            action()
        } label: {
            IconFABIcon(systemImage: systemImage, isAI: isAI)
        }
        .disabled(disabled)
        .accessibilityLabel(accessibilityLabel)
    }
}

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
            IconFABMenuCore(
                systemImage: systemImage,
                accessibilityLabel: accessibilityLabel,
                isAI: isAI,
                disabled: disabled,
                menuContent: menuContent
            )
            .padding(.trailing, CopilotDockLayout.fabTrailingPadding)
            .padding(.bottom, 8)
        }
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
            IconFABButtonCore(
                systemImage: systemImage,
                accessibilityLabel: accessibilityLabel,
                isAI: isAI,
                disabled: disabled,
                action: action
            )
            .padding(.trailing, CopilotDockLayout.fabTrailingPadding)
            .padding(.bottom, 8)
        }
    }
}
