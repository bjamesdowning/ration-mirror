import SwiftUI

struct SettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    var embedded = false
    var onAskRation: () -> Void = {}
    @State private var model = SettingsSessionViewModel()
    @State private var healthExportMessage: String?
    @State private var confirmingHealthExportOff = false
    @State private var healthExportBusy = false
    @State private var showingPaywall = false
    @State private var showingPrivacy = false
    @State private var showingNutritionGoals = false

    var body: some View {
        Group {
            if embedded {
                settingsRoot
            } else {
                NavigationStack { settingsRoot }
            }
        }
        .task { await model.load(api: env.api) }
    }

    private var settingsRoot: some View {
        Group {
            if let session = model.session {
                content(session)
            } else if model.isLoading {
                LoadingView()
            } else {
                sessionErrorState
            }
        }
        .navigationTitle(embedded ? "" : String(localized: "Account"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !embedded {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .background(Theme.ceramic)
        .sheet(isPresented: $showingPaywall) {
            PaywallView(context: .settings())
        }
        .sheet(isPresented: $showingPrivacy) { PrivacySettingsView() }
        .sheet(isPresented: $showingNutritionGoals, onDismiss: {
            env.lifecycle.bumpRefresh(forTab: .manifest)
        }) {
            NutritionGoalsView()
        }
    }

    private var sessionErrorState: some View {
        VStack(spacing: 16) {
            if let errorMessage = model.errorMessage {
                ErrorBanner(message: errorMessage)
            } else {
                Text("Unable to load settings.")
                    .font(Typography.body())
                    .foregroundStyle(Theme.muted)
            }
            Button("Retry") {
                Task { await model.load(api: env.api) }
            }
            .buttonStyle(SecondaryButtonStyle())
            NavigationLink {
                AccountDeletionView(onAccountDeleted: { dismiss() })
            } label: {
                Label("Delete account", systemImage: "trash")
            }
            .foregroundStyle(Theme.danger)
            Button(String(localized: "Sign out"), role: .destructive) {
                Task {
                    await env.auth.signOut()
                    dismiss()
                }
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.ceramic)
    }

    private func content(_ session: SessionResponse) -> some View {
        List {
            Section {
                AvatarUploadPicker(
                    title: "Your photo",
                    imageURL: env.session.userImageURL,
                    upload: { data, mime in
                        _ = try await env.api.uploadUserAvatar(imageData: data, mimeType: mime)
                    }
                )
                .listRowBackground(Color.clear)
            } header: {
                SettingsSectionHeader(title: "Profile", systemImage: "person.crop.circle")
            }

            Section {
                LabeledContent("Name", value: session.user.name ?? "—")
                LabeledContent("Email", value: session.user.email)
            } header: {
                SettingsSectionHeader(title: "Account", systemImage: "person.text.rectangle")
            }

            Section {
                LabeledContent(
                    "Your plan",
                    value: MembershipDisplay.tierLabel(isAccountCrewMember: session.isAccountCrewMember)
                )
                if let note = MembershipDisplay.householdCapacityNote(
                    organizationIsCrew: session.isCrewMember,
                    isAccountCrewMember: session.isAccountCrewMember
                ) {
                    Text(note)
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                }
                LabeledContent("Credits", value: "\(session.credits)")
                Button {
                    showingPaywall = true
                } label: {
                    SettingsNavigationLabel(
                        title: MembershipDisplay.billingButtonTitle(
                            isAccountCrewMember: session.isAccountCrewMember
                        ),
                        systemImage: "creditcard"
                    )
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.hyperGreen)
            } header: {
                SettingsSectionHeader(title: "Membership", systemImage: "creditcard")
            }

            Section {
                Button { showingPrivacy = true } label: {
                    SettingsNavigationLabel(title: "Feature enablement", systemImage: "hand.raised")
                }
                .buttonStyle(.plain)
                Button { openURL(AppConfig.privacyURL) } label: {
                    SettingsNavigationLabel(title: "Privacy Policy", systemImage: "hand.raised")
                }
                .buttonStyle(.plain)
                Button { openURL(AppConfig.termsURL) } label: {
                    SettingsNavigationLabel(title: "Terms of Service", systemImage: "hand.raised")
                }
                .buttonStyle(.plain)
                if let consent = model.settings?.aiConsentAt, !consent.isEmpty {
                    LabeledContent("AI Features", value: "On")
                }
            } header: {
                SettingsSectionHeader(title: "Privacy", systemImage: "hand.raised")
            }

            Section {
                Button {
                    if env.session.clientFlags.isNutritionFuelPageEnabled {
                        dismiss()
                        env.openDeepLink(.fuelGoals)
                    } else {
                        showingNutritionGoals = true
                    }
                } label: {
                    SettingsNavigationLabel(title: "Nutrition Goals", systemImage: "flame")
                }
                .buttonStyle(.plain)
                if DiaryLayout.controlVisible(
                    fastLogEnabled: env.session.clientFlags.isNutritionFastLogEnabled,
                    appVersion: AppMarketingVersion.current
                ) {
                    Picker(
                        "Day layout",
                        selection: Binding(
                            get: {
                                DiaryLayoutMode.normalize(model.settings?.diaryLayout)
                            },
                            set: { mode in
                                Task {
                                    let response = try? await env.api.patchSettings(
                                        SettingsPatch(diaryLayout: mode.rawValue)
                                    )
                                    if let response {
                                        env.launch.updateUserSettings(response.settings)
                                        model.applySettings(response.settings)
                                    }
                                }
                            }
                        )
                    ) {
                        Text("Timeline").tag(DiaryLayoutMode.timeline)
                        Text("Slots").tag(DiaryLayoutMode.slots)
                    }
                    .accessibilityLabel("Diary layout")
                }
                if HealthExportPolicy.switchVisible(
                    flagEnabled: env.session.clientFlags.isNutritionHealthExportEnabled,
                    appVersion: AppMarketingVersion.current
                ) {
                    Toggle(
                        "Apple Health",
                        isOn: Binding(
                            get: { model.settings?.healthExport?.enabled == true },
                            set: { enabled in
                                if enabled {
                                    Task { await turnOnHealthExport() }
                                } else {
                                    confirmingHealthExportOff = true
                                }
                            }
                        )
                    )
                    .disabled(healthExportBusy)
                    .confirmationDialog(
                        "Turn off Apple Health?",
                        isPresented: $confirmingHealthExportOff,
                        titleVisibility: .visible
                    ) {
                        Button("Remove from Apple Health", role: .destructive) {
                            Task { await turnOffHealthExport(remove: true) }
                        }
                        Button("Keep in Apple Health") {
                            Task { await turnOffHealthExport(remove: false) }
                        }
                        Button("Cancel", role: .cancel) {}
                    } message: {
                        Text("Ration will stop copying foods. You can also remove the foods Ration already copied.")
                    }
                    Text(HealthExportStatusText.footer)
                        .rationCaption()
                    if model.settings?.healthExport?.enabled == true {
                        healthExportStatusRows
                    }
                    if let healthExportMessage {
                        Text(healthExportMessage)
                            .rationCaption()
                            .foregroundStyle(Theme.danger)
                    }
                }
            } header: {
                SettingsSectionHeader(title: "Nutrition", systemImage: "flame")
            }

            if let settings = model.settings {
                AppearanceSettingsSection(settings: settings, api: env.api)
                    .id(settings.theme ?? "dark")
                MeasurementsSettingsSection(settings: settings)
                PreferencesSettingsSection(settings: settings, api: env.api)
            }

            SettingsHelpSection(
                copilotEnabled: env.session.clientFlags.isRationCopilotEnabled,
                onAskRation: onAskRation
            )
            SettingsTutorialSection()

            Section {
                Button(String(localized: "Sign out"), role: .destructive) {
                    Task {
                        await env.auth.signOut()
                        dismiss()
                    }
                }
            } header: {
                SettingsSectionHeader(title: "Session", systemImage: "rectangle.portrait.and.arrow.right")
            }

            Section {
                NavigationLink {
                    AccountDeletionView(onAccountDeleted: { dismiss() })
                } label: {
                    Label("Delete account", systemImage: "trash")
                }
                .foregroundStyle(Theme.danger)
            } header: {
                SettingsSectionHeader(title: "Danger zone", systemImage: "trash")
            } footer: {
                Text("Permanently delete your account and personal data. This cannot be undone.")
            }

            Section {
                Text(appVersionLabel)
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .refreshable {
            await model.load(api: env.api)
            if let settings = model.settings {
                env.theme.syncFromServer(settings)
                env.unitDisplayMode.syncFromServer(settings)
            }
        }
    }

    private var appVersionLabel: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "—"
        let build = info?["CFBundleVersion"] as? String ?? "—"
        return "Version \(short) (\(build))"
    }

    @ViewBuilder
    private var healthExportStatusRows: some View {
        let exporter = env.healthExport
        if HealthKitExporter.shared.authorizedTypes().isEmpty {
            Button("Allow Apple Health access on this iPhone") {
                Task { await turnOnHealthExport() }
            }
        } else {
            HStack {
                Text(HealthExportStatusText.lastSynced(exporter.lastSyncedAt))
                    .rationCaption()
                Spacer()
                Button(exporter.isSyncing ? "Syncing…" : "Sync now") {
                    healthExportMessage = nil
                    Task { await exporter.sync(.manual) }
                }
                .disabled(exporter.isSyncing || healthExportBusy)
            }
        }
        Text(HealthExportStatusText.exclusionNote(excluded: exporter.excluded))
            .rationCaption()
        if let failure = HealthExportStatusText.failure(
            failed: exporter.lastFailures,
            unauthorized: exporter.lastUnauthorized,
            error: exporter.lastError
        ) {
            HStack {
                Text(failure)
                    .rationCaption()
                    .foregroundStyle(Theme.danger)
                Spacer()
                Button("Try again") {
                    Task { await exporter.sync(.manual) }
                }
                .disabled(exporter.isSyncing)
            }
        }
    }

    /// Ask HealthKit for write access first, then store the preference, then copy
    /// the whole window. The server rejects the save until intake consent exists.
    private func turnOnHealthExport() async {
        healthExportMessage = nil
        healthExportBusy = true
        defer { healthExportBusy = false }
        do {
            try await HealthKitExporter.shared.requestWriteAuthorization()
        } catch {
            healthExportMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            return
        }
        let sharing = !HealthKitExporter.shared.authorizedTypes().isEmpty
        let deviceStatus = HealthExportToggle.deviceStatus(
            enabled: true,
            sharingAuthorized: sharing
        )
        do {
            let response = try await env.api.setHealthExport(
                enabled: true,
                confirm: true,
                deviceStatus: deviceStatus
            )
            applyHealthExport(enabled: response.enabled ?? true, status: response.status ?? deviceStatus)
            guard sharing else {
                healthExportMessage = "Apple Health access is off for Ration. Turn it on in the Health app under Sharing."
                return
            }
            await env.healthExport.sync(.enabled)
        } catch {
            healthExportMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Remove first (while the server still has the list), then turn the preference off.
    private func turnOffHealthExport(remove: Bool) async {
        healthExportMessage = nil
        healthExportBusy = true
        defer { healthExportBusy = false }
        if remove {
            let removed = await env.healthExport.purgeAll()
            if !removed {
                healthExportMessage = "Some foods couldn't be removed from Apple Health. Try again, or delete them in the Health app."
                return
            }
        }
        do {
            let response = try await env.api.setHealthExport(
                enabled: false,
                confirm: true,
                deviceStatus: "off"
            )
            applyHealthExport(enabled: response.enabled ?? false, status: response.status ?? "off")
            env.healthExport.forget()
        } catch {
            healthExportMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func applyHealthExport(enabled: Bool, status: String) {
        guard var settings = model.settings else { return }
        settings.healthExport = HealthExportPreference(
            enabled: enabled,
            deviceStatus: status,
            clearRequested: settings.healthExport?.clearRequested
        )
        model.applySettings(settings)
    }
}

/// Settings strings for Apple Health. Pure so tests can pin the copy.
enum HealthExportStatusText {
    static let footer =
        "Copies the foods you log in Fuel to Apple Health: calories, protein, carbs, fat, and fiber when known. An AI estimate is copied only after you accept it. Ration only writes to Health and never reads your Health data."

    static let exclusionRule = "Not copied: an AI estimate you have not accepted, and a few older or incomplete logs."

    static func lastSynced(_ date: Date?, now: Date = Date()) -> String {
        guard let date else { return "Not synced yet" }
        if now.timeIntervalSince(date) < 60 { return "Last synced just now" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return "Last synced \(formatter.localizedString(for: date, relativeTo: now))"
    }

    static func exclusionNote(excluded: Int) -> String {
        switch excluded {
        case 0: exclusionRule
        case 1: "\(exclusionRule) 1 food in your log wasn't copied."
        default: "\(exclusionRule) \(excluded) foods in your log weren't copied."
        }
    }

    static func failure(failed: Int, unauthorized: Int, error: String?) -> String? {
        if let error { return error }
        if failed > 0 {
            return "Some foods weren't copied to Apple Health. \(failed) failed."
        }
        if unauthorized > 0 {
            return "Some nutrients are turned off for Ration in the Health app."
        }
        return nil
    }
}
