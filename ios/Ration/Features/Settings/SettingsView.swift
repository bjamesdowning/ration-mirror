import SwiftUI

struct SettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var model = SettingsSessionViewModel()
    @State private var showingPaywall = false
    @State private var showingPrivacy = false

    var body: some View {
        NavigationStack {
            Group {
                if let session = model.session {
                    content(session)
                } else if model.isLoading {
                    LoadingView()
                } else {
                    sessionErrorState
                }
            }
            .navigationTitle(String(localized: "Settings"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .background(Theme.ceramic)
            .sheet(isPresented: $showingPaywall) {
                PaywallView(context: .settings())
            }
            .sheet(isPresented: $showingPrivacy) { PrivacySettingsView() }
        }
        .task { await model.load(api: env.api) }
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
            NavigationLink("Delete account") {
                AccountDeletionView(onAccountDeleted: { dismiss() })
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
            Section("Profile") {
                AvatarUploadPicker(
                    title: "Your photo",
                    imageURL: env.session.userImageURL,
                    upload: { data, mime in
                        _ = try await env.api.uploadUserAvatar(imageData: data, mimeType: mime)
                    }
                )
                .listRowBackground(Color.clear)
            }

            Section("Account") {
                LabeledContent("Name", value: session.user.name ?? "—")
                LabeledContent("Email", value: session.user.email)
            }

            Section("Membership") {
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
                Button(
                    MembershipDisplay.billingButtonTitle(
                        isAccountCrewMember: session.isAccountCrewMember
                    )
                ) {
                    showingPaywall = true
                }
                .foregroundStyle(Theme.hyperGreen)
            }

            Section("Privacy") {
                Button("Privacy & AI") { showingPrivacy = true }
                Button("Privacy Policy") { openURL(AppConfig.privacyURL) }
                Button("Terms of Service") { openURL(AppConfig.termsURL) }
                if let consent = model.settings?.aiConsentAt, !consent.isEmpty {
                    LabeledContent("AI consent", value: "Granted")
                }
            }

            if let settings = model.settings {
                AppearanceSettingsSection(settings: settings, api: env.api)
                    .id(settings.theme ?? "dark")
                MeasurementsSettingsSection(settings: settings)
                PreferencesSettingsSection(settings: settings, api: env.api)
            }

            SettingsHelpSection()
            SettingsTutorialSection()

            Section {
                Button(String(localized: "Sign out"), role: .destructive) {
                    Task {
                        await env.auth.signOut()
                        dismiss()
                    }
                }
            }

            Section {
                NavigationLink("Delete account") {
                    AccountDeletionView(onAccountDeleted: { dismiss() })
                }
                .foregroundStyle(Theme.danger)
            } header: {
                Text("Danger zone")
            } footer: {
                Text("Permanently delete your account and personal data. This cannot be undone.")
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
}
