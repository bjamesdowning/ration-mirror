import Foundation

/// Fixed Gregorian calendar-day helpers in the device's current time zone.
/// Prefer these for nutrition API day keys — never add raw seconds across DST.
enum LocalDay {
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        return calendar
    }

    static func todayISO(now: Date = Date(), calendar: Calendar = calendar) -> String {
        isoString(from: now, calendar: calendar)
    }

    static func isoString(from date: Date, calendar: Calendar = calendar) -> String {
        let y = calendar.component(.year, from: date)
        let m = calendar.component(.month, from: date)
        let d = calendar.component(.day, from: date)
        return String(format: "%04d-%02d-%02d", y, m, d)
    }

    static func date(from isoDate: String, calendar: Calendar = calendar) -> Date? {
        let parts = isoDate.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var components = DateComponents()
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        return calendar.date(from: components)
    }

    static func addDays(
        _ isoDate: String,
        days: Int,
        calendar: Calendar = calendar
    ) -> String {
        guard let date = date(from: isoDate, calendar: calendar),
              let next = calendar.date(byAdding: .day, value: days, to: date)
        else { return isoDate }
        return isoString(from: next, calendar: calendar)
    }

    /// Inclusive ISO day keys from `from` through `to`, or `[]` when bounds are invalid/reversed.
    static func isoDates(
        from: String,
        to: String,
        calendar: Calendar = calendar
    ) -> [String] {
        guard let start = date(from: from, calendar: calendar),
              let end = date(from: to, calendar: calendar),
              start <= end
        else { return [] }
        var dates: [String] = []
        var cursor = start
        while cursor <= end {
            dates.append(isoString(from: cursor, calendar: calendar))
            guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
            cursor = next
        }
        return dates
    }

    static func contains(
        _ isoDate: String,
        from: String,
        to: String
    ) -> Bool {
        isoDate >= from && isoDate <= to
    }
}
