import SwiftUI

// MARK: - Shared Hub widget primitives

struct HubWidgetHeader: View {
    let title: String
    let systemImage: String
    var trailing: String?

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .foregroundStyle(Theme.hyperGreen)
            Text(title).rationHeadline()
            Spacer()
            if let trailing {
                Text(trailing)
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
            }
        }
    }
}

struct HubProgressBar: View {
    let progress: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Theme.platinum)
                Capsule()
                    .fill(Theme.hyperGreen)
                    .frame(width: max(0, geo.size.width * min(max(progress, 0), 1)))
            }
        }
        .frame(height: 4)
        .animation(MotionPolicy.shortFade, value: progress)
    }
}

enum HubDateFormat {
    static func smartLabel(isoDate: String) -> String {
        if isoDate == ManifestDateHelpers.todayISO() { return "Today" }
        guard let date = localDate(from: isoDate) else { return isoDate }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE d"
        formatter.timeZone = TimeZone.current
        return formatter.string(from: date)
    }

    private static func localDate(from isoDate: String) -> Date? {
        var components = DateComponents()
        let parts = isoDate.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        return Calendar.current.date(from: components)
    }
}

struct HubDateChip: View {
    let isoDate: String
    var isToday: Bool = false
    var isSelected: Bool = false

    var body: some View {
        Text(HubDateFormat.smartLabel(isoDate: isoDate))
            .font(Typography.caption())
            .foregroundStyle(isSelected || isToday ? Theme.onHyperGreen : Theme.carbon)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(isSelected || isToday ? Theme.hyperGreen : Theme.platinum)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

struct HubSlotBadge: View {
    let slotType: String

    private var abbreviation: String {
        switch slotType.lowercased() {
        case "breakfast": return "BRKFST"
        case "lunch": return "LUNCH"
        case "dinner": return "DINNER"
        case "snack": return "SNACK"
        default: return String(slotType.prefix(6)).uppercased()
        }
    }

    var body: some View {
        Text(abbreviation)
            .font(Typography.mono(9, weight: .bold))
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(Theme.platinum)
            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
    }
}

struct HubMatchRing: View {
    let percentage: Double

    private var progress: Double { min(max(percentage / 100, 0), 1) }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme.platinum, lineWidth: 3)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(percentage >= 100 ? Theme.hyperGreen : Theme.muted, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(Int(percentage))")
                .font(Typography.mono(10, weight: .bold))
                .foregroundStyle(percentage >= 100 ? Theme.hyperGreen : Theme.carbon)
        }
        .frame(width: 32, height: 32)
    }
}

struct HubUrgencyLabel: View {
    let date: Date
    var reference: Date = Date()
    var isExpired: Bool = false

    private var daysUntil: Int {
        Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: reference), to: Calendar.current.startOfDay(for: date)).day ?? 0
    }

    private var label: String {
        if daysUntil < 0 { return "Expired" }
        if daysUntil == 0 { return "Today" }
        if daysUntil == 1 { return "1d" }
        return "\(daysUntil)d"
    }

    private var color: Color {
        if isExpired || daysUntil < 0 { return Theme.danger }
        if daysUntil <= 3 { return Theme.warning }
        return Theme.muted
    }

    var body: some View {
        Text(label)
            .font(Typography.mono(11, weight: .semibold))
            .foregroundStyle(color)
    }
}

// MARK: - Nutrition Hub primitives

struct HubFuelRing: View {
    let progress: Double
    let valueText: String
    var overTarget: Bool = false
    var diameter: CGFloat = 88

    private var clamped: Double { min(max(progress, 0), 1) }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme.platinum, lineWidth: 8)
            Circle()
                .trim(from: 0, to: clamped)
                .stroke(
                    overTarget ? Theme.warning : Theme.hyperGreen,
                    style: StrokeStyle(lineWidth: 8, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(MotionPolicy.shortFade, value: clamped)
            Text(valueText)
                .font(Typography.mono(13, weight: .bold))
                .foregroundStyle(Theme.carbon)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)
        }
        .frame(width: diameter, height: diameter)
    }
}

struct HubMacroBar: View {
    let label: String
    let valueText: String
    let progress: Double
    var overTarget: Bool = false

    private var clamped: Double { min(max(progress, 0), 1) }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
                Spacer()
                Text(valueText)
                    .font(Typography.mono(11, weight: .semibold))
                    .foregroundStyle(Theme.carbon)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.platinum)
                    Capsule()
                        .fill(overTarget ? Theme.warning : Theme.hyperGreen)
                        .frame(width: max(0, geo.size.width * clamped))
                }
            }
            .frame(height: 4)
            .animation(MotionPolicy.shortFade, value: clamped)
        }
    }
}

struct HubNutrientSparkline: View {
    let values: [Double]

    var body: some View {
        let maxValue = max(values.max() ?? 1, 1)
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(Array(values.enumerated()), id: \.offset) { _, value in
                Capsule()
                    .fill(Theme.hyperGreen.opacity(0.85))
                    .frame(maxWidth: .infinity)
                    .frame(height: max(6, CGFloat(value / maxValue) * 32))
            }
        }
        .frame(height: 32)
    }
}
