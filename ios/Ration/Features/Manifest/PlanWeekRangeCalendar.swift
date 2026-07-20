import SwiftUI

/// Native range picker for Plan week: contiguous days within today…today+6.
struct PlanWeekRangeCalendar: View {
    @Binding var rangeStart: String?
    @Binding var rangeEnd: String?
    @Environment(\.calendar) private var calendar

    private var today: String { ManifestDateHelpers.todayISO() }

    private var windowEnd: String {
        ManifestDateHelpers.planningWindowEnd(today: today)
    }

    private var selectableBounds: Range<Date> {
        ManifestDateHelpers.planningWindowBounds(today: today, calendar: calendar)
    }

    private var datesBinding: Binding<Set<DateComponents>> {
        Binding(
            get: {
                guard let start = rangeStart else { return [] }
                let end = rangeEnd ?? start
                return Set(
                    ManifestDateHelpers.isoDates(from: start, to: end).compactMap {
                        ManifestDateHelpers.dateComponents(fromISO: $0, calendar: calendar)
                    }
                )
            },
            set: { newComponents in
                let newISOs = Set(
                    newComponents.compactMap {
                        ManifestDateHelpers.isoString(fromComponents: $0, calendar: calendar)
                    }
                )
                let previousISOs = Set(
                    ManifestDateHelpers.isoDates(
                        from: rangeStart ?? today,
                        to: rangeEnd ?? rangeStart ?? today
                    )
                )
                let next = PlanWeekRangeSelection.applyPickerChange(
                    previousISOs: rangeStart == nil ? [] : previousISOs,
                    newISOs: newISOs,
                    today: today
                )
                rangeStart = next.start
                rangeEnd = next.end
            }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(
                "Select days from today through \(ManifestDateHelpers.smartLabel(isoDate: windowEnd)). Past dates and anything beyond that window are unavailable."
            )
            .rationCaption()
            .foregroundStyle(Theme.muted)
            .fixedSize(horizontal: false, vertical: true)

            MultiDatePicker(
                "Plan dates",
                selection: datesBinding,
                in: selectableBounds
            )
            .labelsHidden()
            .tint(Theme.hyperGreen)
            .frame(maxWidth: .infinity)

            if let start = rangeStart {
                Text("Start: \(ManifestDateHelpers.smartLabel(isoDate: start))")
                    .rationCaption()
            }
            if let end = rangeEnd, end != rangeStart {
                Text("End: \(ManifestDateHelpers.smartLabel(isoDate: end))")
                    .rationCaption()
            } else if rangeStart != nil, rangeEnd == rangeStart {
                Text("Planning 1 day")
                    .rationCaption()
            }
        }
        .padding(12)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

enum PlanWeekRangeSelection {
    static func isValid(
        start: String?,
        end: String?,
        maxDays: Int = 7,
        today: String? = nil
    ) -> Bool {
        guard let start, let end,
              let count = ManifestDateHelpers.daysBetweenInclusive(start: start, end: end)
        else { return false }
        let anchor = today ?? ManifestDateHelpers.todayISO()
        let windowEnd = ManifestDateHelpers.planningWindowEnd(today: anchor)
        return count >= 1
            && count <= maxDays
            && start >= anchor
            && end <= windowEnd
            && start <= end
    }

    static func dayCount(start: String, end: String) -> Int? {
        ManifestDateHelpers.daysBetweenInclusive(start: start, end: end)
    }

    /// Maps a MultiDatePicker selection change onto a contiguous ISO range.
    /// - Empty selection resets to today (single-day).
    /// - Adding a day outside an existing multi-day range restarts at that day.
    /// - Otherwise uses min…max of the new set when within `maxDays`.
    static func applyPickerChange(
        previousISOs: Set<String>,
        newISOs: Set<String>,
        today: String,
        maxDays: Int = 7
    ) -> (start: String, end: String) {
        let windowEnd = ManifestDateHelpers.planningWindowEnd(today: today)
        let clampedNew = Set(newISOs.filter { $0 >= today && $0 <= windowEnd })

        if clampedNew.isEmpty {
            return (today, today)
        }

        let added = clampedNew.subtracting(previousISOs)

        if !added.isEmpty,
           previousISOs.count > 1,
           clampedNew.count == previousISOs.count + 1,
           let prevMin = previousISOs.min(),
           let prevMax = previousISOs.max(),
           let tap = added.sorted().first,
           tap < prevMin || tap > prevMax
        {
            return (tap, tap)
        }

        guard let lower = clampedNew.min(), let upper = clampedNew.max() else {
            return (today, today)
        }

        if let count = ManifestDateHelpers.daysBetweenInclusive(start: lower, end: upper),
           count <= maxDays
        {
            return (lower, upper)
        }

        if let tap = added.sorted().first {
            return (tap, tap)
        }
        return (lower, lower)
    }
}
