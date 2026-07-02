import SwiftUI

struct AppearanceSettingsSection: View {
    @Environment(AppEnvironment.self) private var env
    let api: RationAPI

    @State private var selectedTheme: AppTheme
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var saveTask: Task<Void, Never>?

    init(settings: UserSettings, api: RationAPI) {
        self.api = api
        _selectedTheme = State(initialValue: AppTheme(serverValue: settings.theme) ?? .dark)
    }

    var body: some View {
        Section {
            if let errorMessage {
                Text(errorMessage)
                    .foregroundStyle(Theme.danger)
                    .font(Typography.caption())
            }

            Picker("Color scheme", selection: $selectedTheme) {
                Text("Light").tag(AppTheme.light)
                Text("Dark").tag(AppTheme.dark)
            }
            .pickerStyle(.segmented)
            .disabled(isSaving)
            .onChange(of: selectedTheme) { _, newTheme in
                saveTask?.cancel()
                saveTask = Task { await saveTheme(newTheme) }
            }
        } header: {
            Text("Appearance")
        } footer: {
            Text("Syncs with your Ration account on web and mobile.")
        }
        .onDisappear {
            saveTask?.cancel()
        }
    }

    private func saveTheme(_ theme: AppTheme) async {
        guard !Task.isCancelled else { return }
        guard theme != env.theme.theme else { return }

        isSaving = true
        errorMessage = nil
        let previousTheme = env.theme.theme
        env.theme.apply(theme)

        defer {
            if !Task.isCancelled {
                isSaving = false
            }
        }

        do {
            _ = try await api.patchSettings(SettingsPatch(theme: theme.rawValue))
            guard !Task.isCancelled, env.theme.theme == theme else { return }
            Haptics.success()
        } catch {
            guard !Task.isCancelled, env.theme.theme == theme else { return }
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            env.theme.apply(previousTheme)
            selectedTheme = previousTheme
        }
    }
}
