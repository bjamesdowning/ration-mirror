import SwiftUI

/// Primary CTA — Hyper-Green fill, Carbon label (AI actions).
struct PrimaryButtonStyle: ButtonStyle {
    var isLoading: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) {
            if isLoading { ProgressView().tint(.black) }
            configuration.label
        }
        .font(Typography.headline())
        .foregroundStyle(Color.black)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Theme.hyperGreen.opacity(configuration.isPressed ? 0.85 : 1))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .opacity(isLoading ? 0.7 : 1)
    }
}

/// Alias for AI-powered sheet CTAs (Generate, Import, Plan week, Scan).
typealias AIButtonStyle = PrimaryButtonStyle

/// Secondary — platinum fill, carbon label.
struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Typography.headline())
            .foregroundStyle(Theme.carbon)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Theme.platinum.opacity(configuration.isPressed ? 0.7 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// Frosted surface card used across feature screens.
struct GlassCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(16)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Theme.platinum, lineWidth: 1)
            )
    }
}

/// Standard inline error banner.
struct ErrorBanner: View {
    let message: String

    var body: some View {
        Text(message)
            .font(Typography.caption())
            .foregroundStyle(Theme.danger)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .padding(12)
            .background(Theme.danger.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

/// Full-screen centered loading state.
struct LoadingView: View {
    var label: String = "Loading…"
    var body: some View {
        VStack(spacing: 12) {
            ProgressView().tint(Theme.hyperGreen)
            Text(label).rationCaption()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.ceramic)
    }
}

/// Empty-state placeholder.
struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 40))
                .foregroundStyle(Theme.muted)
            Text(title).rationHeadline()
            Text(message)
                .rationCaption()
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
        .padding(.horizontal, 24)
    }
}
