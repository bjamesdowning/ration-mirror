import SwiftUI

/// Purchase row for paywall packages — padded two-line layout with optional badge.
struct PaywallProductRow: View {
    let title: String
    let subtitle: String?
    let price: String
    let badge: String?
    let isPurchasing: Bool
    let style: Style
    let action: () -> Void

    enum Style {
        case primary
        case secondary
    }

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    if let badge {
                        Text(badge.uppercased())
                            .font(Typography.caption())
                            .foregroundStyle(Theme.hyperGreen)
                            .tracking(0.6)
                    }
                    Text(isPurchasing ? "Purchasing…" : title)
                        .font(Typography.headline())
                        .foregroundStyle(labelColor)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                    if let subtitle, !isPurchasing {
                        Text(subtitle)
                            .font(Typography.caption())
                            .foregroundStyle(subtitleColor)
                    }
                }
                Spacer(minLength: 8)
                if isPurchasing {
                    ProgressView()
                        .tint(style == .primary ? Theme.onHyperGreen : Theme.hyperGreen)
                } else {
                    Text(price)
                        .font(Typography.headline())
                        .monospacedDigit()
                        .foregroundStyle(labelColor)
                        .layoutPriority(1)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(borderColor, lineWidth: style == .secondary ? 1 : 0)
            )
        }
        .buttonStyle(.plain)
        .disabled(isPurchasing)
        .accessibilityElement(children: .combine)
    }

    private var labelColor: Color {
        style == .primary ? Theme.onHyperGreen : Theme.carbon
    }

    private var subtitleColor: Color {
        style == .primary ? Theme.onHyperGreen.opacity(0.75) : Theme.muted
    }

    private var background: Color {
        switch style {
        case .primary:
            Theme.hyperGreen
        case .secondary:
            Theme.surface
        }
    }

    private var borderColor: Color {
        style == .secondary ? Theme.platinum : .clear
    }
}
