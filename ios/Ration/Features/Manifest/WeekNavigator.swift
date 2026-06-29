import SwiftUI

enum ManifestDateHelpers {
    private static var calendar: Calendar {
        Calendar.current
    }

    private static func localDate(from isoDate: String) -> Date? {
        var components = DateComponents()
        let parts = isoDate.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        return calendar.date(from: components)
    }

    private static func isoString(from date: Date) -> String {
        let y = calendar.component(.year, from: date)
        let m = calendar.component(.month, from: date)
        let d = calendar.component(.day, from: date)
        return String(format: "%04d-%02d-%02d", y, m, d)
    }

    static func addDays(_ isoDate: String, days: Int) -> String {
        guard let date = localDate(from: isoDate),
              let next = calendar.date(byAdding: .day, value: days, to: date)
        else { return isoDate }
        return isoString(from: next)
    }

    static func todayISO() -> String {
        isoString(from: Date())
    }

    static func weekStart(for date: String, preference: String) -> String {
        guard let d = localDate(from: date) else { return date }
        var cal = calendar
        cal.firstWeekday = preference == "monday" ? 2 : 1
        let weekday = cal.component(.weekday, from: d)
        let offset = preference == "monday"
            ? (weekday == 1 ? 6 : weekday - 2)
            : (weekday - 1)
        guard let start = cal.date(byAdding: .day, value: -offset, to: d) else { return date }
        return isoString(from: start)
    }

    static func calendarDates(span: Int, anchor: String, weekStartPref: String) -> [String] {
        if span == 7 {
            let start = weekStart(for: anchor, preference: weekStartPref)
            return (0..<7).map { addDays(start, days: $0) }
        }
        return (0..<span).map { addDays(anchor, days: $0) }
    }

    static func dayShortName(_ isoDate: String) -> String {
        guard let date = localDate(from: isoDate) else { return isoDate }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE"
        formatter.timeZone = TimeZone.current
        return formatter.string(from: date)
    }

    static func dayNumber(_ isoDate: String) -> String {
        guard let date = localDate(from: isoDate) else { return "?" }
        return String(calendar.component(.day, from: date))
    }

    static func formatRange(start: String, end: String) -> String {
        guard let s = localDate(from: start), let e = localDate(from: end) else { return start }
        let display = DateFormatter()
        display.dateFormat = "MMM d"
        display.timeZone = TimeZone.current
        let year = calendar.component(.year, from: s)
        if calendar.isDate(s, equalTo: e, toGranularity: .month) {
            return "\(display.string(from: s))–\(calendar.component(.day, from: e)), \(year)"
        }
        return "\(display.string(from: s)) – \(display.string(from: e)), \(year)"
    }
}

struct WeekNavigator: View {
    let calendarSpan: Int
    @Binding var rangeStart: String
    @Binding var selectedDay: String
    var weekStartPref: String = "sunday"
    var entryDates: Set<String> = []
    var onNavigate: (String) -> Void

    private var rangeEnd: String {
        ManifestDateHelpers.addDays(rangeStart, days: max(calendarSpan - 1, 0))
    }

    private var visibleDays: [String] {
        ManifestDateHelpers.calendarDates(
            span: calendarSpan,
            anchor: rangeStart,
            weekStartPref: weekStartPref
        )
    }

    private var todayAnchor: String {
        calendarSpan == 7
            ? ManifestDateHelpers.weekStart(for: ManifestDateHelpers.todayISO(), preference: weekStartPref)
            : ManifestDateHelpers.todayISO()
    }

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Button {
                    onNavigate(ManifestDateHelpers.addDays(rangeStart, days: -calendarSpan))
                } label: {
                    Image(systemName: "chevron.left")
                        .foregroundStyle(Theme.muted)
                }
                .accessibilityLabel("Previous")

                Text(ManifestDateHelpers.formatRange(start: rangeStart, end: rangeEnd))
                    .font(Typography.headline())
                    .foregroundStyle(Theme.carbon)
                    .frame(minWidth: 160)

                Button {
                    onNavigate(ManifestDateHelpers.addDays(rangeStart, days: calendarSpan))
                } label: {
                    Image(systemName: "chevron.right")
                        .foregroundStyle(Theme.muted)
                }
                .accessibilityLabel("Next")

                if rangeStart != todayAnchor {
                    Button("Today") {
                        onNavigate(todayAnchor)
                    }
                    .font(Typography.caption())
                    .foregroundStyle(Theme.carbon)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Theme.platinum)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(visibleDays, id: \.self) { day in
                        dayPill(day)
                    }
                }
            }
        }
    }

    private func dayPill(_ day: String) -> some View {
        let isSelected = day == selectedDay
        let hasMeals = entryDates.contains(day)
        return Button {
            selectedDay = day
        } label: {
            VStack(spacing: 4) {
                Text(ManifestDateHelpers.dayShortName(day))
                    .font(Typography.caption())
                Text(ManifestDateHelpers.dayNumber(day))
                    .font(Typography.headline())
                Circle()
                    .fill(hasMeals ? Theme.hyperGreen : Color.clear)
                    .frame(width: 6, height: 6)
            }
            .foregroundStyle(isSelected ? Color.black : Theme.carbon)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(isSelected ? Theme.hyperGreen : Theme.platinum)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
