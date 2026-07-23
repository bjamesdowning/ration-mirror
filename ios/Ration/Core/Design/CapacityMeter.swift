import SwiftUI

/// Compact Free-tier usage meter (≥80% warning / at-limit critical).
/// Mirrors web `CapacityIndicator` — UX only; server still enforces limits.
struct CapacityMeter: View {
    let label: String
    let current: Int
    let limit: Int
    var onUpgrade: (() -> Void)?

    private var percent: Int? {
        TierLimits.usagePercent(current: current, limit: limit)
    }

    private var isWarning: Bool {
        TierLimits.isSoftWarning(current: current, limit: limit)
    }

    private var isCritical: Bool {
        TierLimits.isAtLimit(current: current, limit: limit)
    }

    var body: some View {
        if limit == TierLimits.unlimited || limit <= 0 {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("\(current)/\(limit) \(label)")
                        .font(Typography.mono(11))
                        .foregroundStyle(textColor)
                    Spacer()
                    if isWarning || isCritical {
                        Button(isCritical ? "Limit reached — Upgrade" : "Upgrade for unlimited") {
                            onUpgrade?()
                        }
                        .font(Typography.caption())
                        .fontWeight(.bold)
                        .textCase(.uppercase)
                        .foregroundStyle(Theme.hyperGreen)
                        .buttonStyle(.plain)
                    }
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Theme.platinum)
                        Capsule()
                            .fill(barColor)
                            .frame(width: geo.size.width * CGFloat(percent ?? 0) / 100)
                    }
                }
                .frame(height: 4)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(current) of \(limit) \(label)")
            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 8, trailing: 16))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
        }
    }

    private var barColor: Color {
        if isCritical { return Theme.danger }
        if isWarning { return Theme.warning }
        return Theme.hyperGreen.opacity(0.6)
    }

    private var textColor: Color {
        if isCritical { return Theme.danger }
        if isWarning { return Theme.warning }
        return Theme.muted
    }
}
