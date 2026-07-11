import SwiftUI

/// Manifest-specific options — calendar settings + share link.
struct ManifestOptionsSheet: View {
    @Environment(\.dismiss) private var dismiss
    var weekStart: String
    var calendarSpan: Int
    var shareURL: String?
    var shareExpiresAt: String?
    var isLoadingShare: Bool = false
    var onShare: () async -> Void = {}
    var onRevokeShare: () async -> Void = {}
    var onUpgradeRequired: () -> Void = {}
    var onSaveSettings: (_ weekStart: String, _ calendarSpan: Int) async -> Void = { _, _ in }

    @State private var selectedWeekStart: String
    @State private var selectedCalendarSpan: Int
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(
        weekStart: String,
        calendarSpan: Int,
        shareURL: String?,
        shareExpiresAt: String?,
        isLoadingShare: Bool = false,
        onShare: @escaping () async -> Void = {},
        onRevokeShare: @escaping () async -> Void = {},
        onUpgradeRequired: @escaping () -> Void = {},
        onSaveSettings: @escaping (_ weekStart: String, _ calendarSpan: Int) async -> Void = { _, _ in }
    ) {
        self.weekStart = weekStart
        self.calendarSpan = calendarSpan
        self.shareURL = shareURL
        self.shareExpiresAt = shareExpiresAt
        self.isLoadingShare = isLoadingShare
        self.onShare = onShare
        self.onRevokeShare = onRevokeShare
        self.onUpgradeRequired = onUpgradeRequired
        self.onSaveSettings = onSaveSettings
        _selectedWeekStart = State(initialValue: weekStart)
        _selectedCalendarSpan = State(initialValue: calendarSpan)
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Calendar") {
                    if let errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(Theme.danger)
                            .font(Typography.caption())
                    }
                    Text("Controls how many days you see on the Manifest page only. Does not affect Supply.")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                    Picker("Week starts", selection: $selectedWeekStart) {
                        Text("Sunday").tag("sunday")
                        Text("Monday").tag("monday")
                    }
                    Picker("Calendar span", selection: $selectedCalendarSpan) {
                        Text("3 days").tag(3)
                        Text("5 days").tag(5)
                        Text("7 days").tag(7)
                    }
                    Button("Save calendar settings") {
                        Task { await saveSettings() }
                    }
                    .disabled(isSaving || !settingsChanged)
                }

                ShareLinkSection(
                    shareURL: shareURL,
                    shareExpiresAt: shareExpiresAt,
                    capabilities: [
                        "Viewers can see your meal plan",
                        "They cannot edit your plan",
                    ],
                    isLoading: isLoadingShare,
                    onGenerate: onShare,
                    onRevoke: onRevokeShare
                )
            }
            .navigationTitle("Manifest options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onChange(of: weekStart) { _, newValue in
            selectedWeekStart = newValue
        }
        .onChange(of: calendarSpan) { _, newValue in
            selectedCalendarSpan = newValue
        }
    }

    private var settingsChanged: Bool {
        selectedWeekStart != weekStart || selectedCalendarSpan != calendarSpan
    }

    private func saveSettings() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        await onSaveSettings(selectedWeekStart, selectedCalendarSpan)
    }
}
