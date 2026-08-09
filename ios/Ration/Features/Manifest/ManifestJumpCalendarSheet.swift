import SwiftUI

/// Custom month grid for jumping Manifest to a historical or future day.
/// Mirrors web `ManifestCalendarOverlay` (planned + optional intake dots).
struct ManifestJumpCalendarSheet: View {
    @Environment(\.dismiss) private var dismiss

    let initialDay: String
    var weekStartPref: String = "sunday"
    var showConsumedMarkers: Bool = false
    var loadMarkers: (String, String) async throws -> (planned: [String], consumed: [String])
    var onSelect: (String) -> Void

    @State private var year: Int
    @State private var month: Int
    @State private var selectedDay: String
    @State private var plannedDates: Set<String> = []
    @State private var consumedDates: Set<String> = []
    @ScaledMetric(relativeTo: .body) private var chevronPoints: CGFloat = 17

    private static let monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]

    init(
        initialDay: String,
        weekStartPref: String = "sunday",
        showConsumedMarkers: Bool = false,
        loadMarkers: @escaping (String, String) async throws -> (planned: [String], consumed: [String]),
        onSelect: @escaping (String) -> Void
    ) {
        self.initialDay = initialDay
        self.weekStartPref = weekStartPref
        self.showConsumedMarkers = showConsumedMarkers
        self.loadMarkers = loadMarkers
        self.onSelect = onSelect
        let parsed = ManifestDateHelpers.parseYearMonth(initialDay)
        _year = State(initialValue: parsed.year)
        _month = State(initialValue: parsed.month)
        _selectedDay = State(initialValue: initialDay)
    }

    private var today: String { ManifestDateHelpers.todayISO() }

    private var grid: [String] {
        ManifestDateHelpers.buildMonthGrid(year: year, month: month, weekStartPref: weekStartPref)
    }

    private var labels: [String] {
        ManifestDateHelpers.weekdayLabels(weekStartPref: weekStartPref)
    }

    private var monthPrefix: String {
        String(format: "%04d-%02d", year, month)
    }

    private var monthTitle: String {
        let name = Self.monthNames[max(0, min(11, month - 1))]
        return "\(name) \(year)"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                monthHeader
                weekdayHeader
                monthGrid
                legend
                Text(ManifestDateHelpers.historyKeptTitle)
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
                Spacer(minLength: 0)
            }
            .padding(.horizontal)
            .padding(.top, 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(Theme.ceramic)
            .navigationTitle("Go to date")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Go") {
                        guard ManifestDateHelpers.isCalendarDaySelectable(selectedDay) else { return }
                        onSelect(selectedDay)
                        dismiss()
                    }
                }
            }
            .task(id: "\(year)-\(month)") {
                await fetchMarkersForVisibleMonth()
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var monthHeader: some View {
        HStack(spacing: 0) {
            Button {
                shiftMonth(by: -1)
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: chevronPoints, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Previous month")

            Spacer(minLength: 8)

            Text(monthTitle)
                .font(Typography.headline())
                .foregroundStyle(Theme.carbon)
                .multilineTextAlignment(.center)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            Spacer(minLength: 8)

            Button {
                shiftMonth(by: 1)
            } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: chevronPoints, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Next month")
        }
    }

    private var weekdayHeader: some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7),
            spacing: 4
        ) {
            ForEach(labels, id: \.self) { label in
                Text(label.uppercased())
                    .font(Typography.mono(10))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }
        }
    }

    private var monthGrid: some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7),
            spacing: 4
        ) {
            ForEach(grid, id: \.self) { date in
                dayCell(date)
            }
        }
    }

    private var legend: some View {
        Text(
            showConsumedMarkers
                ? "Green dots mark planned meals · gray marks logged intake"
                : "Green dots mark planned meals"
        )
        .font(Typography.mono(10))
        .foregroundStyle(Theme.muted)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func dayCell(_ date: String) -> some View {
        let inMonth = date.hasPrefix(monthPrefix)
        let selectable = ManifestDateHelpers.isCalendarDaySelectable(date, today: today)
        let isToday = date == today
        let isSelected = date == selectedDay
        let hasPlan = plannedDates.contains(date)
        let hasIntake = showConsumedMarkers && consumedDates.contains(date)
        let dayNumber = Int(date.suffix(2)) ?? 0

        Button {
            guard selectable else { return }
            selectedDay = date
        } label: {
            VStack(spacing: 2) {
                Text("\(dayNumber)")
                    .font(Typography.mono(12))
                    .foregroundStyle(selectable ? Theme.carbon : Theme.muted.opacity(0.5))
                HStack(spacing: 2) {
                    if hasPlan {
                        Circle()
                            .fill(Theme.hyperGreen)
                            .frame(width: 5, height: 5)
                    }
                    if hasIntake {
                        Circle()
                            .fill(Theme.carbon.opacity(0.4))
                            .frame(width: 5, height: 5)
                    }
                }
                .frame(height: 6)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(
                isSelected
                    ? Theme.hyperGreen.opacity(0.15)
                    : Color.clear
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(
                        isSelected
                            ? Theme.hyperGreen
                            : (isToday ? Theme.platinum : Color.clear),
                        lineWidth: 1
                    )
            )
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .opacity(inMonth ? 1 : 0.4)
        }
        .buttonStyle(.borderless)
        .disabled(!selectable)
        .accessibilityLabel(accessibilityLabel(for: date, hasPlan: hasPlan, hasIntake: hasIntake, isSelected: isSelected))
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
        .accessibilityHint(selectable ? "" : ManifestDateHelpers.historyKeptTitle)
    }

    private func accessibilityLabel(
        for date: String,
        hasPlan: Bool,
        hasIntake: Bool,
        isSelected: Bool
    ) -> String {
        var parts = [date]
        if hasPlan { parts.append("planned meals") }
        if hasIntake { parts.append("intake logged") }
        if isSelected { parts.append("selected") }
        return parts.joined(separator: ", ")
    }

    private func shiftMonth(by delta: Int) {
        let next = ManifestDateHelpers.shiftYearMonth(year: year, month: month, delta: delta)
        year = next.year
        month = next.month
    }

    private func fetchMarkersForVisibleMonth() async {
        let bounds = ManifestDateHelpers.monthBounds(year: year, month: month)
        do {
            let markers = try await loadMarkers(bounds.from, bounds.to)
            guard !Task.isCancelled else { return }
            plannedDates = Set(markers.planned)
            consumedDates = Set(markers.consumed)
        } catch {
            guard !Task.isCancelled else { return }
            // Soft-fail offline / network errors — jump still works without dots.
            plannedDates = []
            consumedDates = []
        }
    }
}
