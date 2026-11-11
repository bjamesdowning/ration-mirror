import SwiftUI

/// Shared date-rocker type. Manifest and Fuel use the same face, color, and chevron size.
enum DateRockerMetrics {
    static let chevronPoints: CGFloat = 17
    static let labelColor = Theme.carbon
    static let chevronColor = Theme.muted
}

struct DateRockerLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Typography.headline())
            .foregroundStyle(DateRockerMetrics.labelColor)
            .multilineTextAlignment(.center)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }
}

struct DateRockerChevron: View {
    let systemName: String
    var isEnabled = true
    @ScaledMetric(relativeTo: .body) private var points: CGFloat = DateRockerMetrics.chevronPoints

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: points, weight: .semibold))
            .foregroundStyle(isEnabled ? DateRockerMetrics.chevronColor : Theme.platinum)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
    }
}
