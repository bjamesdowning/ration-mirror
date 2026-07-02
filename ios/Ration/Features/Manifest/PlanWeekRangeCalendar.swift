import SwiftUI

/// Travel-style range picker: tap start, tap end (max 7 inclusive days).
struct PlanWeekRangeCalendar: View {
    @Binding var rangeStart: String?
    @Binding var rangeEnd: String?
    @State private var displayedMonth: String

    private let maxDays = 7
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)

    init(rangeStart: Binding<String?>, rangeEnd: Binding<String?>) {
        _rangeStart = rangeStart
        _rangeEnd = rangeEnd
        let initial = rangeStart.wrappedValue ?? ManifestDateHelpers.todayISO()
        _displayedMonth = State(initialValue: initial)
    }

    private var monthDates: [String] {
        ManifestDateHelpers.monthGridDates(containing: displayedMonth)
    }

    private var validationMessage: String? {
        guard let start = rangeStart, let end = rangeEnd,
              let count = ManifestDateHelpers.daysBetweenInclusive(start: start, end: end)
        else { return nil }
        if count > maxDays {
            return "Maximum \(maxDays) days — select a shorter range."
        }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Select a start date, then an end date (up to 7 days).")
                .rationCaption()
                .foregroundStyle(Theme.muted)

            HStack {
                Button {
                    displayedMonth = ManifestDateHelpers.addDays(displayedMonth, days: -28)
                } label: {
                    Image(systemName: "chevron.left")
                }
                .accessibilityLabel("Previous month")

                Spacer()
                Text(monthTitle)
                    .rationHeadline()
                Spacer()

                Button {
                    displayedMonth = ManifestDateHelpers.addDays(displayedMonth, days: 28)
                } label: {
                    Image(systemName: "chevron.right")
                }
                .accessibilityLabel("Next month")
            }

            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(["S", "M", "T", "W", "T", "F", "S"], id: \.self) { label in
                    Text(label)
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity)
                }
                ForEach(monthDates, id: \.self) { day in
                    dayCell(day)
                }
            }

            if let start = rangeStart {
                Text("Start: \(ManifestDateHelpers.smartLabel(isoDate: start))")
                    .rationCaption()
            }
            if let end = rangeEnd {
                Text("End: \(ManifestDateHelpers.smartLabel(isoDate: end))")
                    .rationCaption()
            }
            if let validationMessage {
                Text(validationMessage)
                    .rationCaption()
                    .foregroundStyle(Theme.danger)
            }
        }
        .padding(12)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var monthTitle: String {
        guard let date = isoDate(from: displayedMonth) else { return displayedMonth }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        formatter.timeZone = TimeZone.current
        return formatter.string(from: date)
    }

    private func dayCell(_ day: String) -> some View {
        let isStart = rangeStart == day
        let isEnd = rangeEnd == day
        let inRange = isDayInRange(day)
        let isToday = day == ManifestDateHelpers.todayISO()

        return Button {
            selectDay(day)
        } label: {
            Text(ManifestDateHelpers.dayNumber(day))
                .font(Typography.caption())
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(cellBackground(isStart: isStart, isEnd: isEnd, inRange: inRange, isToday: isToday))
                .foregroundStyle(isStart || isEnd ? Theme.ceramic : Theme.carbon)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(ManifestDateHelpers.smartLabel(isoDate: day))
    }

    private func cellBackground(isStart: Bool, isEnd: Bool, inRange: Bool, isToday: Bool) -> Color {
        if isStart || isEnd { return Theme.hyperGreen }
        if inRange { return Theme.hyperGreen.opacity(0.25) }
        if isToday { return Theme.platinum }
        return Color.clear
    }

    private func isDayInRange(_ day: String) -> Bool {
        guard let start = rangeStart, let end = rangeEnd else { return false }
        let lower = min(start, end)
        let upper = max(start, end)
        return day >= lower && day <= upper
    }

    private func selectDay(_ day: String) {
        if rangeStart == nil || (rangeStart != nil && rangeEnd != nil) {
            rangeStart = day
            rangeEnd = nil
            return
        }
        guard let start = rangeStart else { return }
        let lower = min(start, day)
        let upper = max(start, day)
        if let count = ManifestDateHelpers.daysBetweenInclusive(start: lower, end: upper), count <= maxDays {
            rangeStart = lower
            rangeEnd = upper
        } else {
            rangeStart = day
            rangeEnd = nil
        }
    }

    private func isoDate(from iso: String) -> Date? {
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}

enum PlanWeekRangeSelection {
    static func isValid(start: String?, end: String?, maxDays: Int = 7) -> Bool {
        guard let start, let end,
              let count = ManifestDateHelpers.daysBetweenInclusive(start: start, end: end)
        else { return false }
        return count >= 1 && count <= maxDays
    }

    static func dayCount(start: String, end: String) -> Int? {
        ManifestDateHelpers.daysBetweenInclusive(start: start, end: end)
    }
}
