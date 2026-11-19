import SwiftUI

/// Same integer quarters as `fuelMacroShade` on the worker.
enum FuelMacroShade {
    static func level(actual: Double, goal: Double, logged: Bool) -> Int? {
        guard logged, actual.isFinite, goal.isFinite else { return nil }
        let roundedActual = Int(actual.rounded())
        let roundedGoal = Int(goal.rounded())
        guard roundedGoal > 0 else { return nil }
        if roundedActual * 4 <= roundedGoal { return 1 }
        if roundedActual * 2 < roundedGoal { return 2 }
        if roundedActual * 4 < roundedGoal * 3 { return 3 }
        return 4
    }

    /// Hyper green on the platinum track: 25, 50, 75, and 100 percent.
    static func opacity(for level: Int) -> Double {
        switch level {
        case 1: 0.25
        case 2: 0.5
        case 3: 0.75
        default: 1
        }
    }
}

/// Picture of the seven-day window. Cells are not controls.
enum FuelConsistency {
    struct Cell: Equatable, Identifiable {
        let nutrient: String
        let date: String
        let shade: Int?
        let accessibilityLabel: String
        var id: String { "\(nutrient)-\(date)" }
    }

    struct Row: Equatable, Identifiable {
        let name: String
        let cells: [Cell]
        var id: String { name }
    }

    static func rows(from days: [FuelDayResponse.ConsistencyDay]?) -> [Row] {
        guard let days, !days.isEmpty else { return [] }
        return nutrients.compactMap { nutrient in
            let shown = days.contains { hasPositiveTarget(nutrient.goal($0)) }
            guard shown else { return nil }
            let cells = days.map { day in
                let goal = nutrient.goal(day)
                let actual = nutrient.actual(day)
                let positive = hasPositiveTarget(goal)
                let shade = positive
                    ? FuelMacroShade.level(actual: actual ?? 0, goal: goal ?? 0, logged: day.logged)
                    : nil
                return Cell(
                    nutrient: nutrient.name,
                    date: day.date,
                    shade: shade,
                    accessibilityLabel: spoken(
                        nutrient: nutrient.name,
                        date: day.date,
                        logged: day.logged,
                        actual: actual,
                        goal: positive ? goal : nil
                    )
                )
            }
            return Row(name: nutrient.name, cells: cells)
        }
    }

    static func weekdayLetter(_ iso: String) -> String {
        guard let date = parse(iso) else { return "" }
        let formatter = DateFormatter()
        formatter.calendar = gregorian
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEEEE"
        return String(formatter.string(from: date).prefix(1))
    }

    static func spoken(
        nutrient: String,
        date: String,
        logged: Bool,
        actual: Double?,
        goal: Double?
    ) -> String {
        let day = spokenDate(date)
        let roundedGoal = goal.map { Int($0.rounded()) } ?? 0
        if roundedGoal <= 0 {
            return "\(nutrient), \(day), no target"
        }
        if !logged {
            return "\(nutrient), \(day), not logged"
        }
        let roundedActual = Int((actual ?? 0).rounded())
        return "\(nutrient), \(day), \(roundedActual) of \(roundedGoal) grams"
    }

    private struct Nutrient {
        let name: String
        let actual: (FuelDayResponse.ConsistencyDay) -> Double?
        let goal: (FuelDayResponse.ConsistencyDay) -> Double?
    }

    private static let nutrients: [Nutrient] = [
        Nutrient(name: "Protein", actual: { $0.proteinG }, goal: { $0.goal?.proteinG }),
        Nutrient(name: "Carbs", actual: { $0.carbsG }, goal: { $0.goal?.carbsG }),
        Nutrient(name: "Fat", actual: { $0.fatG }, goal: { $0.goal?.fatG }),
    ]

    private static let gregorian = Calendar(identifier: .gregorian)

    private static func hasPositiveTarget(_ value: Double?) -> Bool {
        guard let value, value.isFinite else { return false }
        return Int(value.rounded()) > 0
    }

    private static func parse(_ iso: String) -> Date? {
        let parser = DateFormatter()
        parser.calendar = gregorian
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = TimeZone(secondsFromGMT: 0)
        parser.dateFormat = "yyyy-MM-dd"
        return parser.date(from: iso)
    }

    private static func spokenDate(_ iso: String) -> String {
        guard let date = parse(iso) else { return iso }
        let formatter = DateFormatter()
        formatter.calendar = gregorian
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEEE d MMMM"
        return formatter.string(from: date)
    }
}

/// Three macro rows under the rings. A missing `consistency` key draws nothing.
struct FuelConsistencyRows: View {
    let days: [FuelDayResponse.ConsistencyDay]?

    var body: some View {
        let rows = FuelConsistency.rows(from: days)
        if !rows.isEmpty, let letters = rows.first?.cells {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(rows) { row in
                    HStack(spacing: 6) {
                        Text(row.name)
                            .font(Typography.caption())
                            .foregroundStyle(Theme.carbon)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .frame(width: 72, alignment: .leading)
                        ForEach(row.cells) { cell in
                            shade(cell)
                        }
                    }
                }
                HStack(spacing: 6) {
                    Color.clear
                        .frame(width: 72, height: 1)
                        .accessibilityHidden(true)
                    ForEach(letters) { cell in
                        Text(FuelConsistency.weekdayLetter(cell.date))
                            .font(Typography.caption())
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .frame(maxWidth: .infinity)
                            .accessibilityHidden(true)
                    }
                }
            }
            .accessibilityElement(children: .contain)
        }
    }

    private func shade(_ cell: FuelConsistency.Cell) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(Theme.platinum)
            if let level = cell.shade {
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(Theme.hyperGreen.opacity(FuelMacroShade.opacity(for: level)))
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 16)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(cell.accessibilityLabel)
    }
}
