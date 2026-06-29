import SwiftUI

enum ManifestDateHelpers {
    static func addDays(_ isoDate: String, days: Int) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        guard let date = formatter.date(from: isoDate) else { return isoDate }
        guard let next = Calendar.current.date(byAdding: .day, value: days, to: date) else { return isoDate }
        return formatter.string(from: next)
    }

    static func todayISO() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        return formatter.string(from: Date())
    }

    static func weekStart(for date: String, preference: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        guard let d = formatter.date(from: date) else { return date }
        var calendar = Calendar.current
        calendar.firstWeekday = preference == "monday" ? 2 : 1
        let components = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: d)
        guard let start = calendar.date(from: components) else { return date }
        return formatter.string(from: start)
    }

    static func formatRange(start: String, end: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        guard let s = formatter.date(from: start), let e = formatter.date(from: end) else { return start }
        let display = DateFormatter()
        display.dateFormat = "MMM d"
        let year = Calendar.current.component(.year, from: s)
        if Calendar.current.isDate(s, equalTo: e, toGranularity: .month) {
            return "\(display.string(from: s))–\(Calendar.current.component(.day, from: e)), \(year)"
        }
        return "\(display.string(from: s)) – \(display.string(from: e)), \(year)"
    }
}

struct WeekNavigator: View {
    let calendarSpan: Int
    @Binding var rangeStart: String
    var weekStartPref: String = "sunday"
    var onNavigate: (String) -> Void

    private var rangeEnd: String {
        ManifestDateHelpers.addDays(rangeStart, days: max(calendarSpan - 1, 0))
    }

    private var todayAnchor: String {
        calendarSpan == 7
            ? ManifestDateHelpers.weekStart(for: ManifestDateHelpers.todayISO(), preference: weekStartPref)
            : ManifestDateHelpers.todayISO()
    }

    var body: some View {
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
    }
}
