import SwiftUI

/// Range math for the Manifest Macros page. Averages use logged days only.
enum MacrosHistoryMath {
    /// Matches `NUTRITION_SUMMARY_MAX_SPAN_DAYS` on the summary route.
    static let maxSpanDays = 93

    static func weekRange(
        containing today: String,
        weekStart: String,
        calendar: Calendar = LocalDay.calendar
    ) -> (from: String, to: String) {
        guard let date = LocalDay.date(from: today, calendar: calendar) else {
            return (today, today)
        }
        var cal = calendar
        cal.firstWeekday = weekStart == "monday" ? 2 : 1
        let weekday = cal.component(.weekday, from: date)
        let offset = weekStart == "monday"
            ? (weekday == 1 ? 6 : weekday - 2)
            : (weekday - 1)
        let start = LocalDay.addDays(today, days: -offset, calendar: calendar)
        return (start, LocalDay.addDays(start, days: 6, calendar: calendar))
    }

    static func monthRange(
        containing today: String,
        calendar: Calendar = LocalDay.calendar
    ) -> (from: String, to: String) {
        guard let date = LocalDay.date(from: today, calendar: calendar) else {
            return (today, today)
        }
        let year = calendar.component(.year, from: date)
        let month = calendar.component(.month, from: date)
        let start = String(format: "%04d-%02d-01", year, month)
        guard let startDate = LocalDay.date(from: start, calendar: calendar),
              let days = calendar.range(of: .day, in: .month, for: startDate)
        else { return (start, start) }
        let end = String(format: "%04d-%02d-%02d", year, month, days.count)
        return (start, end)
    }

    static func spanDays(
        from: String,
        to: String,
        calendar: Calendar = LocalDay.calendar
    ) -> Int {
        LocalDay.isoDates(from: from, to: to, calendar: calendar).count
    }

    /// Daily mean of days with at least one intake. `excluding` drops a partial today.
    static func loggedAverage(
        days: [NutritionDayTotals],
        excluding date: String? = nil
    ) -> NutritionSummary.Totals? {
        let logged = days.filter { day in
            day.entryCount > 0 && day.date != date
        }
        guard !logged.isEmpty else { return nil }
        let count = Double(logged.count)
        var fiberSum = 0.0
        var fiberKnown = 0
        for day in logged {
            if let fiber = day.fiberG {
                fiberSum += fiber
                fiberKnown += 1
            }
        }
        return NutritionSummary.Totals(
            energyKcal: logged.reduce(0) { $0 + $1.energyKcal } / count,
            proteinG: logged.reduce(0) { $0 + $1.proteinG } / count,
            carbsG: logged.reduce(0) { $0 + $1.carbsG } / count,
            fatG: logged.reduce(0) { $0 + $1.fatG } / count,
            fiberG: fiberKnown > 0 ? fiberSum / Double(fiberKnown) : nil
        )
    }
}

struct MacrosHistoryView: View {
    @Environment(AppEnvironment.self) private var env
    var onOpenGoals: () -> Void = {}

    @State private var preset: Preset = .week
    @State private var includeToday = true
    @State private var customFrom = ""
    @State private var customTo = ""
    @State private var showingCustom = false
    @State private var page: MacrosHistoryResponse?
    @State private var isLoading = false
    @State private var errorMessage: String?

    private enum Preset: String, CaseIterable, Identifiable {
        case week, month, custom
        var id: String { rawValue }
        var title: String {
            switch self {
            case .week: return "Week"
            case .month: return "Month"
            case .custom: return "Custom"
            }
        }
    }

    private var today: String { LocalDay.todayISO() }

    private var weekStart: String {
        env.launch.userSettings?.manifestSettings?.weekStart ?? "sunday"
    }

    private var range: (from: String, to: String) {
        switch preset {
        case .week:
            return MacrosHistoryMath.weekRange(containing: today, weekStart: weekStart)
        case .month:
            return MacrosHistoryMath.monthRange(containing: today)
        case .custom:
            if customFrom.isEmpty || customTo.isEmpty {
                return MacrosHistoryMath.weekRange(containing: today, weekStart: weekStart)
            }
            return customFrom <= customTo
                ? (customFrom, customTo)
                : (customTo, customFrom)
        }
    }

    private var loadKey: String {
        "\(range.from)-\(range.to)-\(env.session.activeOrganizationId ?? "")"
    }

    var body: some View {
        List {
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(Theme.danger)
                }
            }
            rangeSection
            if isLoading && page == nil {
                Section {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                }
            } else if let page {
                averagesSection(page)
                comparisonSection(page)
                daysSection(page)
                notesSection(page)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .navigationTitle("Macros")
        .navigationBarTitleDisplayMode(.large)
        .safeAreaInset(edge: .bottom) {
            Text("Not medical advice. Goals and totals are planning aids only.")
                .rationCaption()
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.vertical, 8)
                .background(Theme.ceramic)
        }
        .sheet(isPresented: $showingCustom) {
            MacrosCustomRangeSheet(from: customBound(customFrom), to: customBound(customTo)) { from, to in
                customFrom = LocalDay.isoString(from: from)
                customTo = LocalDay.isoString(from: to)
                preset = .custom
            }
        }
        .task(id: loadKey) { await reload() }
    }

    private var rangeSection: some View {
        Section {
            Picker("Range", selection: $preset) {
                ForEach(Preset.allCases) { item in
                    Text(item.title).tag(item)
                }
            }
            .pickerStyle(.segmented)
            Toggle("Include today", isOn: $includeToday)
            if preset == .custom {
                Button("Choose dates") { showingCustom = true }
            }
            Text(ManifestDateHelpers.formatRange(start: range.from, end: range.to))
                .rationCaption()
                .foregroundStyle(Theme.muted)
            if !includeToday {
                Text("Today is left out of the average.")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    @ViewBuilder
    private func averagesSection(_ page: MacrosHistoryResponse) -> some View {
        let days = visibleDays(page.current.days)
        let average = MacrosHistoryMath.loggedAverage(
            days: days,
            excluding: includeToday ? nil : today
        )
        let logged = days.filter { $0.entryCount > 0 && (includeToday || $0.date != today) }.count
        Section {
            if let average {
                macroBars(average: average, goal: page.current.goal)
                HubNutrientSparkline(
                    values: NutritionDayFill.fillSparseDays(
                        from: page.current.from,
                        to: page.current.to,
                        days: days
                    ).map(\.energyKcal)
                )
                Text("\(logged) of \(days.count) days logged")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
            } else {
                Text("Log intakes on Manifest to see averages.")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
            }
        } header: {
            Text("Daily average")
        }
    }

    @ViewBuilder
    private func comparisonSection(_ page: MacrosHistoryResponse) -> some View {
        let current = MacrosHistoryMath.loggedAverage(
            days: visibleDays(page.current.days),
            excluding: includeToday ? nil : today
        )
        let previous = MacrosHistoryMath.loggedAverage(days: page.previous.days)
        Section {
            if let current, let previous {
                comparisonRow("Calories", current.energyKcal - previous.energyKcal, unit: "kcal")
                comparisonRow("Protein", current.proteinG - previous.proteinG, unit: "g")
                comparisonRow("Carbs", current.carbsG - previous.carbsG, unit: "g")
                comparisonRow("Fat", current.fatG - previous.fatG, unit: "g")
            } else {
                Text("Log intakes in both periods to compare them.")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
            }
            Text(
                "Previous period · \(ManifestDateHelpers.formatRange(start: page.previous.from, end: page.previous.to))"
            )
            .rationCaption()
            .foregroundStyle(Theme.muted)
            Button("Nutrition goals", action: onOpenGoals)
        } header: {
            Text("Previous period")
        }
    }

    private func daysSection(_ page: MacrosHistoryResponse) -> some View {
        let days = visibleDays(page.current.days).sorted { $0.date > $1.date }
        return Section("Days") {
            if days.isEmpty {
                Text("No days in this range.")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
            }
            ForEach(days) { day in
                VStack(alignment: .leading, spacing: 4) {
                    Text(dayTitle(day.date))
                        .rationBody()
                        .foregroundStyle(Theme.carbon)
                    Text(macroLine(day))
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                }
                .listRowBackground(Theme.surface)
            }
        }
    }

    private func notesSection(_ page: MacrosHistoryResponse) -> some View {
        let notes = page.notes.filter { includeToday || $0.date != today }
        return Section("Notes") {
            if notes.isEmpty {
                Text("No notes in this range.")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
            }
            ForEach(notes) { note in
                VStack(alignment: .leading, spacing: 4) {
                    Text(note.mealName ?? "Intake")
                        .rationBody()
                        .foregroundStyle(Theme.carbon)
                    Text(note.notes)
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                    Text(dayTitle(note.date))
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                }
                .listRowBackground(Theme.surface)
            }
        }
    }

    private func macroBars(average: NutritionSummary.Totals, goal: NutritionSummary.Goal?) -> some View {
        VStack(spacing: 10) {
            bar("kcal", actual: average.energyKcal, target: goal?.dailyEnergyKcal, unit: "kcal")
            bar("P", actual: average.proteinG, target: goal?.proteinG, unit: "g")
            bar("C", actual: average.carbsG, target: goal?.carbsG, unit: "g")
            bar("F", actual: average.fatG, target: goal?.fatG, unit: "g")
            if average.fiberG != nil || goal?.fiberG != nil {
                bar("Fiber", actual: average.fiberG ?? 0, target: goal?.fiberG, unit: "g")
            }
        }
        .listRowBackground(Theme.surface)
    }

    private func bar(_ label: String, actual: Double, target: Double?, unit: String) -> some View {
        let progress: Double = {
            guard let target, target > 0 else { return 0 }
            return min(max(actual / target, 0), 1)
        }()
        let value: String = {
            let amount = "\(Int(actual.rounded()))\(unit == "kcal" ? "" : unit)"
            if let target {
                return "\(amount) / \(Int(target.rounded()))"
            }
            return unit == "kcal" ? "\(Int(actual.rounded())) kcal" : amount
        }()
        return HubMacroBar(
            label: label,
            valueText: value,
            progress: progress,
            overTarget: target.map { actual > $0 } ?? false
        )
    }

    private func comparisonRow(_ label: String, _ delta: Double, unit: String) -> some View {
        let rounded = Int(delta.rounded())
        let text = rounded > 0 ? "+\(rounded) \(unit)" : "\(rounded) \(unit)"
        return HStack {
            Text(label)
                .foregroundStyle(Theme.carbon)
            Spacer()
            Text(text)
                .font(Typography.mono(12, weight: .semibold))
                .foregroundStyle(Theme.carbon)
        }
        .listRowBackground(Theme.surface)
    }

    private func visibleDays(_ days: [NutritionDayTotals]) -> [NutritionDayTotals] {
        NutritionDayFill.fillSparseDays(from: range.from, to: range.to, days: days)
    }

    private func macroLine(_ day: NutritionDayTotals) -> String {
        String(
            format: "%.0f kcal · P %.0fg · C %.0fg · F %.0fg",
            day.energyKcal,
            day.proteinG,
            day.carbsG,
            day.fatG
        )
    }

    private func dayTitle(_ iso: String) -> String {
        guard let date = LocalDay.date(from: iso) else { return iso }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }

    private func customBound(_ iso: String) -> Date {
        LocalDay.date(from: iso.isEmpty ? today : iso) ?? Date()
    }

    private func reload() async {
        let span = MacrosHistoryMath.spanDays(from: range.from, to: range.to)
        guard span > 0, span <= MacrosHistoryMath.maxSpanDays else {
            errorMessage = "Choose a range of \(MacrosHistoryMath.maxSpanDays) days or fewer."
            page = nil
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            page = try await env.api.nutritionMacros(from: range.from, to: range.to)
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

private struct MacrosCustomRangeSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var from: Date
    @State private var to: Date
    @State private var errorMessage: String?
    let onSave: (Date, Date) -> Void

    init(from: Date, to: Date, onSave: @escaping (Date, Date) -> Void) {
        _from = State(initialValue: from)
        _to = State(initialValue: to)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("Start", selection: $from, displayedComponents: .date)
                DatePicker("End", selection: $to, displayedComponents: .date)
                if let errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(Theme.danger)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.ceramic)
            .navigationTitle("Custom range")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { save() }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func save() {
        let start = min(from, to)
        let end = max(from, to)
        let span = MacrosHistoryMath.spanDays(
            from: LocalDay.isoString(from: start),
            to: LocalDay.isoString(from: end)
        )
        guard span > 0, span <= MacrosHistoryMath.maxSpanDays else {
            errorMessage = "Choose a range of \(MacrosHistoryMath.maxSpanDays) days or fewer."
            return
        }
        onSave(start, end)
        dismiss()
    }
}
