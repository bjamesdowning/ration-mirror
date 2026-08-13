import SwiftUI

/// Compact circular progress for Manifest macro targets (protein / carbs / fat / fiber).
/// Fill is clamped 0…1; over-target uses warning color so overflow is honest in the numbers.
struct MacroProgressDial: View {
    let label: String
    let actualText: String
    let targetText: String
    let progress: Double
    let overTarget: Bool
    let accessibilityText: String
    var diameter: CGFloat = 52

    private var clamped: Double { min(max(progress, 0), 1) }
    private var ringColor: Color { overTarget ? Theme.warning : Theme.hyperGreen }
    private var valueColor: Color { overTarget ? Theme.warning : Theme.carbon }

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(Theme.platinum, lineWidth: 4)
                Circle()
                    .trim(from: 0, to: clamped)
                    .stroke(ringColor, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(MotionPolicy.shortFade, value: clamped)
                Text(actualText)
                    .font(Typography.mono(12, weight: .bold))
                    .foregroundStyle(valueColor)
                    .minimumScaleFactor(0.55)
                    .lineLimit(1)
                    .padding(.horizontal, 6)
            }
            .frame(width: diameter, height: diameter)

            Text(label)
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Text(targetText)
                .font(Typography.mono(10, weight: .regular))
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }
}
