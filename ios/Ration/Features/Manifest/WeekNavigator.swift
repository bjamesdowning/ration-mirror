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

    /// Normalizes navigation anchor: span 7 → week start; span 3/5 → exact date.
    static func normalizedNavigationStart(
        _ date: String,
        calendarSpan: Int,
        weekStartPref: String
    ) -> String {
        if calendarSpan == 7 {
            return weekStart(for: date, preference: weekStartPref)
        }
        return date
    }

    /// Initial anchor when opening Manifest — mirrors web `manifest.tsx` loader.
    static func initialRangeStart(calendarSpan: Int, weekStartPref: String) -> String {
        todayNavigationAnchor(calendarSpan: calendarSpan, weekStartPref: weekStartPref)
    }

    /// Anchor for jumping to “today’s” Manifest window (span 7 → week start; otherwise today).
    static func todayNavigationAnchor(
        calendarSpan: Int,
        weekStartPref: String,
        today: String? = nil
    ) -> String {
        let anchor = today ?? todayISO()
        if calendarSpan == 7 {
            return weekStart(for: anchor, preference: weekStartPref)
        }
        return anchor
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

    static let navigationWeekBound = 26

    static func smartLabel(isoDate: String) -> String {
        HubDateFormat.smartLabel(isoDate: isoDate)
    }

    static func canNavigate(from rangeStart: String, byDays days: Int) -> Bool {
        let target = addDays(rangeStart, days: days)
        return canNavigate(from: rangeStart, to: target)
    }

    static func canNavigate(from rangeStart: String, to target: String) -> Bool {
        let today = todayISO()
        let minDate = addDays(today, days: -navigationWeekBound * 7)
        let maxDate = addDays(today, days: navigationWeekBound * 7)
        return target >= minDate && target <= maxDate
    }

    /// Inclusive day count between two ISO dates (start…end).
    static func daysBetweenInclusive(start: String, end: String) -> Int? {
        guard let s = localDate(from: start), let e = localDate(from: end) else { return nil }
        let startDay = calendar.startOfDay(for: s)
        let endDay = calendar.startOfDay(for: e)
        let days = calendar.dateComponents([.day], from: startDay, to: endDay).day ?? 0
        return days + 1
    }

    /// Forward-looking Manifest window for Supply sync (mirrors web `resolveSupplyManifestWindow`).
    static func supplyManifestWindow(
        horizonDays: Int,
        today: String? = nil
    ) -> (startDate: String, endDate: String, horizonDays: Int) {
        let clamped = min(30, max(1, horizonDays))
        let anchor = today ?? todayISO()
        return (anchor, addDays(anchor, days: clamped - 1), clamped)
    }

    /// Inclusive end of Plan week selectable window (today + 6 days).
    static func planningWindowEnd(today: String? = nil) -> String {
        addDays(today ?? todayISO(), days: 6)
    }

    /// Whether an ISO day falls in `[today, today+6]`.
    static func isSelectablePlanningDay(_ iso: String, today: String? = nil) -> Bool {
        let anchor = today ?? todayISO()
        return iso >= anchor && iso <= planningWindowEnd(today: anchor)
    }

    /// Half-open local-day range for `MultiDatePicker(in:)` so today+6 is inclusive.
    static func planningWindowBounds(
        today: String? = nil,
        calendar cal: Calendar = .current
    ) -> Range<Date> {
        let anchor = today ?? todayISO()
        guard let start = localDate(from: anchor),
              let endExclusive = localDate(from: addDays(anchor, days: 7))
        else {
            let now = cal.startOfDay(for: Date())
            return now ..< now
        }
        return cal.startOfDay(for: start) ..< cal.startOfDay(for: endExclusive)
    }

    /// Inclusive ISO dates from `start` through `end`.
    static func isoDates(from start: String, to end: String) -> [String] {
        guard let count = daysBetweenInclusive(start: start, end: end), count > 0 else { return [] }
        return (0 ..< count).map { addDays(start, days: $0) }
    }

    static func isoString(fromComponents components: DateComponents, calendar cal: Calendar = .current) -> String? {
        guard let date = cal.date(from: components) else { return nil }
        return isoString(from: date)
    }

    static func dateComponents(fromISO iso: String, calendar cal: Calendar = .current) -> DateComponents? {
        guard let date = localDate(from: iso) else { return nil }
        return cal.dateComponents([.calendar, .era, .year, .month, .day], from: date)
    }
}

struct WeekNavigator: View {
    let calendarSpan: Int
    let rangeStart: String
    @Binding var selectedDay: String
    var weekStartPref: String = "sunday"
    var entryDates: Set<String> = []
    var isLoading: Bool = false
    var onNavigate: (String) -> Void
    @ScaledMetric(relativeTo: .body) private var chevronPoints: CGFloat = 17

    private var canGoBack: Bool {
        let target = ManifestDateHelpers.normalizedNavigationStart(
            ManifestDateHelpers.addDays(rangeStart, days: -calendarSpan),
            calendarSpan: calendarSpan,
            weekStartPref: weekStartPref
        )
        return ManifestDateHelpers.canNavigate(from: rangeStart, to: target)
    }

    private var canGoForward: Bool {
        let target = ManifestDateHelpers.normalizedNavigationStart(
            ManifestDateHelpers.addDays(rangeStart, days: calendarSpan),
            calendarSpan: calendarSpan,
            weekStartPref: weekStartPref
        )
        return ManifestDateHelpers.canNavigate(from: rangeStart, to: target)
    }

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

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 0) {
                Button {
                    navigate(toRaw: ManifestDateHelpers.addDays(rangeStart, days: -calendarSpan))
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: chevronPoints, weight: .semibold))
                        .foregroundStyle(canGoBack ? Theme.muted : Theme.platinum)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .disabled(!canGoBack || isLoading)
                .accessibilityLabel("Previous")

                Spacer(minLength: 8)

                HStack(spacing: 8) {
                    if isLoading {
                        ProgressView()
                            .controlSize(.small)
                    }
                    Text(ManifestDateHelpers.formatRange(start: rangeStart, end: rangeEnd))
                        .font(Typography.headline())
                        .foregroundStyle(Theme.carbon)
                        .multilineTextAlignment(.center)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .allowsHitTesting(false)

                Spacer(minLength: 8)

                Button {
                    navigate(toRaw: ManifestDateHelpers.addDays(rangeStart, days: calendarSpan))
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: chevronPoints, weight: .semibold))
                        .foregroundStyle(canGoForward ? Theme.muted : Theme.platinum)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .disabled(!canGoForward || isLoading)
                .accessibilityLabel("Next")
            }
            // List rows expand automatic-style Buttons to the full row and fire every
            // Button in the row on a single tap — Prev then Next → always lands forward.
            .buttonStyle(.borderless)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(visibleDays, id: \.self) { day in
                        dayPill(day)
                    }
                }
                .buttonStyle(.borderless)
            }
        }
    }

    private func navigate(toRaw raw: String) {
        let target = ManifestDateHelpers.normalizedNavigationStart(
            raw,
            calendarSpan: calendarSpan,
            weekStartPref: weekStartPref
        )
        onNavigate(target)
    }

    private func dayPill(_ day: String) -> some View {
        let isSelected = day == selectedDay
        let hasMeals = entryDates.contains(day)
        let isToday = day == ManifestDateHelpers.todayISO()
        return Button {
            selectedDay = day
        } label: {
            VStack(spacing: 4) {
                Text(ManifestDateHelpers.smartLabel(isoDate: day))
                    .font(Typography.caption())
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Circle()
                    .fill(hasMeals ? Theme.hyperGreen : Color.clear)
                    .frame(width: 6, height: 6)
            }
            .foregroundStyle(isSelected || isToday ? Theme.onHyperGreen : Theme.carbon)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(isSelected || isToday ? Theme.hyperGreen : Theme.platinum)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(ManifestDateHelpers.smartLabel(isoDate: day))
        .accessibilityValue(hasMeals ? "Has meals" : "No meals")
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}
