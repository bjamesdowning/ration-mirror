import SwiftUI
import Observation

@MainActor
@Observable
final class SessionViewModel {
    private(set) var session: SessionResponse?
    private(set) var settings: UserSettings?
    private(set) var isLoading = false
    var errorMessage: String?

    func load(api: RationAPI) async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let sessionTask = api.session()
            async let settingsTask = api.settings()
            session = try await sessionTask
            settings = try await settingsTask.settings
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct SettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var model = SessionViewModel()
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
                    Theme.ceramic
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .background(Theme.ceramic)
            .sheet(isPresented: $showingPaywall) { PaywallView() }
            .sheet(isPresented: $showingPrivacy) { PrivacySettingsView() }
        }
        .task { await model.load(api: env.api) }
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
                NavigationLink("Delete account") {
                    AccountDeletionView()
                }
                .foregroundStyle(Theme.danger)
            }

            Section("Membership") {
                LabeledContent("Tier", value: session.isCrewMember ? "Crew Member" : "Free")
                LabeledContent("Credits", value: "\(session.credits)")
                Button(session.isCrewMember ? "Manage billing" : "Upgrade to Crew Member") {
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
            }

            SettingsHelpSection()

            Section {
                Button("Sign out", role: .destructive) {
                    Task {
                        // `auth.signOut()` runs the full wipe (snapshots,
                        // billing, session, image cache) via `AuthManager
                        // .onSignedOut` — see `AppEnvironment.init()` (H-2).
                        // Explicit sign-out and forced 401 logout share this
                        // one path so there's a single source of truth.
                        await env.auth.signOut()
                        dismiss()
                    }
                }
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
