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
        let today = todayISO()
        if calendarSpan == 7 {
            return weekStart(for: today, preference: weekStartPref)
        }
        return today
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

    static func monthGridDates(containing isoDate: String) -> [String] {
        guard let anchor = localDate(from: isoDate) else { return [] }
        let month = calendar.component(.month, from: anchor)
        let year = calendar.component(.year, from: anchor)
        guard let monthStart = calendar.date(from: DateComponents(year: year, month: month, day: 1)),
              let range = calendar.range(of: .day, in: .month, for: monthStart)
        else { return [] }
        return range.compactMap { day -> String? in
            guard let date = calendar.date(from: DateComponents(year: year, month: month, day: day)) else {
                return nil
            }
            return isoString(from: date)
        }
    }
}

struct WeekNavigator: View {
    let calendarSpan: Int
    @Binding var rangeStart: String
    @Binding var selectedDay: String
    var weekStartPref: String = "sunday"
    var entryDates: Set<String> = []
    var isLoading: Bool = false
    var onNavigate: (String) -> Void

    @State private var showingDatePicker = false
    @State private var jumpDate = Date()

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

    private var todayAnchor: String {
        calendarSpan == 7
            ? ManifestDateHelpers.weekStart(for: ManifestDateHelpers.todayISO(), preference: weekStartPref)
            : ManifestDateHelpers.todayISO()
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Button {
                    let raw = ManifestDateHelpers.addDays(rangeStart, days: -calendarSpan)
                    navigate(toRaw: raw)
                } label: {
                    Image(systemName: "chevron.left")
                        .foregroundStyle(canGoBack ? Theme.muted : Theme.platinum)
                }
                .disabled(!canGoBack || isLoading)
                .accessibilityLabel("Previous")

                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                }

                ZStack {
                    Text(ManifestDateHelpers.formatRange(start: rangeStart, end: rangeEnd))
                        .font(Typography.headline())
                        .foregroundStyle(Theme.carbon)
                        .allowsHitTesting(false)

                    HStack(spacing: 0) {
                        Color.clear
                            .contentShape(Rectangle())
                            .onTapGesture {
                                guard canGoBack, !isLoading else { return }
                                navigate(by: -calendarSpan)
                            }
                            .accessibilityLabel("Previous period")
                            .accessibilityAddTraits(.isButton)
                        Color.clear
                            .contentShape(Rectangle())
                            .onTapGesture {
                                guard canGoForward, !isLoading else { return }
                                navigate(by: calendarSpan)
                            }
                            .accessibilityLabel("Next period")
                            .accessibilityAddTraits(.isButton)
                    }
                }
                .frame(minWidth: 160)

                Button {
                    let raw = ManifestDateHelpers.addDays(rangeStart, days: calendarSpan)
                    navigate(toRaw: raw)
                } label: {
                    Image(systemName: "chevron.right")
                        .foregroundStyle(canGoForward ? Theme.muted : Theme.platinum)
                }
                .disabled(!canGoForward || isLoading)
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

                Button {
                    showingDatePicker = true
                } label: {
                    Image(systemName: "calendar")
                        .foregroundStyle(Theme.muted)
                }
                .accessibilityLabel("Go to date")
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(visibleDays, id: \.self) { day in
                        dayPill(day)
                    }
                }
            }
        }
        .sheet(isPresented: $showingDatePicker) {
            NavigationStack {
                VStack {
                    DatePicker("Jump to date", selection: $jumpDate, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .padding()
                    Spacer()
                }
                .navigationTitle("Go to date")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showingDatePicker = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Go") {
                            let formatter = DateFormatter()
                            formatter.dateFormat = "yyyy-MM-dd"
                            formatter.timeZone = TimeZone.current
                            let iso = formatter.string(from: jumpDate)
                            let target = ManifestDateHelpers.normalizedNavigationStart(
                                iso,
                                calendarSpan: calendarSpan,
                                weekStartPref: weekStartPref
                            )
                            onNavigate(target)
                            showingDatePicker = false
                        }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func navigate(by days: Int) {
        let raw = ManifestDateHelpers.addDays(rangeStart, days: days)
        navigate(toRaw: raw)
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
            .foregroundStyle(isSelected ? Theme.ceramic : Theme.carbon)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(isSelected || isToday ? Theme.hyperGreen : Theme.platinum)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(ManifestDateHelpers.smartLabel(isoDate: day))
        .accessibilityValue(hasMeals ? "Has meals" : "No meals")
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}
