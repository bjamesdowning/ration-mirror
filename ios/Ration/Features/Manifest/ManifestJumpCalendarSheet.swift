import SwiftUI

/// Native graphical calendar for jumping Manifest to a historical or future day.
/// Matches web range-label → calendar entry point (`nutrition-manifest` gated by caller).
struct ManifestJumpCalendarSheet: View {
    @Environment(\.dismiss) private var dismiss

    let initialDay: String
    var onSelect: (String) -> Void

    @State private var selectedDate: Date

    init(initialDay: String, onSelect: @escaping (String) -> Void) {
        self.initialDay = initialDay
        self.onSelect = onSelect
        let date = ManifestDateHelpers.date(fromISO: initialDay)
            ?? ManifestDateHelpers.date(fromISO: ManifestDateHelpers.todayISO())
            ?? Date()
        _selectedDate = State(initialValue: date)
    }

    private var bounds: ClosedRange<Date> {
        ManifestDateHelpers.jumpCalendarBounds()
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                DatePicker(
                    "Jump to date",
                    selection: $selectedDate,
                    in: bounds,
                    displayedComponents: .date
                )
                .datePickerStyle(.graphical)
                .labelsHidden()
                .tint(Theme.hyperGreen)
                .padding(.horizontal)

                Text("History kept for 13 months")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)

                Spacer(minLength: 0)
            }
            .background(Theme.ceramic)
            .navigationTitle("Go to date")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Go") {
                        let iso = ManifestDateHelpers.isoString(from: selectedDate)
                        guard ManifestDateHelpers.isCalendarDaySelectable(iso) else { return }
                        onSelect(iso)
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
