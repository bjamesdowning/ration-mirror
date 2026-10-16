import SwiftUI
import WidgetKit

struct MacroBar: View {
    let label: String
    let remaining: Int
    let goal: Int
    let unit: String
    let palette: WidgetPalette

    var body: some View {
        let consumed = Double(goal - remaining)
        let fraction = goal > 0 ? min(1, max(0, consumed / Double(goal))) : 0
        let over = remaining < 0
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label)
                    .font(WidgetType.detail())
                    .foregroundStyle(palette.muted)
                Spacer(minLength: 0)
                Text(unit == "kcal" ? (HomeWidgetCopy.energyLine(remainingKcal: remaining) ?? "") : HomeWidgetCopy.macroLine(remaining: remaining))
                    .font(WidgetType.detail())
                    .foregroundStyle(over ? palette.warning : palette.carbon)
                    .contentTransition(.numericText())
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(palette.muted.opacity(0.25))
                    Capsule()
                        .fill(over ? palette.warning : palette.hyperGreen)
                        .frame(width: proxy.size.width * fraction)
                        .widgetAccentable()
                }
            }
            .frame(height: 4)
        }
    }
}
