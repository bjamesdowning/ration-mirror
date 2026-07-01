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

    func activate(_ org: OrgMembership, env: AppEnvironment) async {
        guard !org.isActive else { return }
        do {
            try await env.session.activateOrg(org, api: env.api, auth: env.auth, snapshots: env.snapshots)
            session = env.session.session
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

                if let org = env.session.activeOrg, org.canManageLogo {
                    AvatarUploadPicker(
                        title: "\(org.name) photo",
                        imageURL: AvatarURLResolver.resolve(org.logo),
                        usesAuthenticatedImage: true,
                        upload: { data, mime in
                            _ = try await env.api.uploadOrganizationAvatar(imageData: data, mimeType: mime)
                        }
                    )
                    .listRowBackground(Color.clear)
                }
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

            if session.organizations.count > 1 {
                Section("Organizations") {
                    ForEach(session.organizations) { org in
                        Button {
                            Task { await model.activate(org, env: env) }
                        } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(org.name).foregroundStyle(Theme.carbon)
                                    if org.role == "owner", org.credits > 0 {
                                        Text("\(org.credits) credits")
                                            .rationCaption()
                                            .foregroundStyle(Theme.muted)
                                    }
                                }
                                Spacer()
                                if org.isActive {
                                    Image(systemName: "checkmark").foregroundStyle(Theme.hyperGreen)
                                }
                            }
                        }
                    }
                }

                if canTransferCredits(session) {
                    TransferCreditsSection(
                        organizations: session.organizations,
                        api: env.api,
                        onTransferred: { Task { await model.load(api: env.api) } }
                    )
                }
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
                ManifestSettingsSection(
                    settings: settings,
                    api: env.api,
                    onSaved: { Task { await model.load(api: env.api) } }
                )
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
        .refreshable { await model.load(api: env.api) }
    }

    private func canTransferCredits(_ session: SessionResponse) -> Bool {
        let ownerWithCredits = session.organizations.contains { $0.role == "owner" && $0.credits > 0 }
        return ownerWithCredits && session.organizations.count >= 2
    }
}

private struct TransferCreditsSection: View {
    let organizations: [OrgMembership]
    let api: RationAPI
    var onTransferred: () -> Void = {}

    @State private var sourceId: String = ""
    @State private var destinationId: String = ""
    @State private var amount = 1
    @State private var isTransferring = false
    @State private var errorMessage: String?
    @State private var successMessage: String?

    private var sourceOrgs: [OrgMembership] {
        organizations.filter { $0.role == "owner" && $0.credits > 0 }
    }

    private var destinationOrgs: [OrgMembership] {
        organizations.filter { $0.id != sourceId }
    }

    var body: some View {
        Section("Transfer credits") {
            if let errorMessage {
                Text(errorMessage).foregroundStyle(Theme.danger).font(Typography.caption())
            }
            if let successMessage {
                Text(successMessage).foregroundStyle(Theme.hyperGreen).font(Typography.caption())
            }
            Picker("From", selection: $sourceId) {
                Text("Select source").tag("")
                ForEach(sourceOrgs) { org in
                    Text("\(org.name) (\(org.credits))").tag(org.id)
                }
            }
            Picker("To", selection: $destinationId) {
                Text("Select destination").tag("")
                ForEach(destinationOrgs) { org in
                    Text(org.name).tag(org.id)
                }
            }
            Stepper("Amount: \(amount)", value: $amount, in: 1...10_000)
            Button("Transfer credits") {
                Task { await transfer() }
            }
            .disabled(isTransferring || sourceId.isEmpty || destinationId.isEmpty)
        }
        .onAppear {
            if sourceId.isEmpty { sourceId = sourceOrgs.first?.id ?? "" }
            if destinationId.isEmpty {
                destinationId = destinationOrgs.first?.id ?? ""
            }
        }
    }

    private func transfer() async {
        isTransferring = true
        errorMessage = nil
        successMessage = nil
        defer { isTransferring = false }
        do {
            _ = try await api.transferCredits(
                sourceOrganizationId: sourceId,
                destinationOrganizationId: destinationId,
                amount: amount
            )
            successMessage = "Credits transferred"
            Haptics.success()
            onTransferred()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

private struct ManifestSettingsSection: View {
    let settings: UserSettings
    let api: RationAPI
    var onSaved: () -> Void = {}

    @State private var weekStart: String
    @State private var calendarSpan: Int
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(settings: UserSettings, api: RationAPI, onSaved: @escaping () -> Void = {}) {
        self.settings = settings
        self.api = api
        self.onSaved = onSaved
        let manifest = settings.manifestSettings
        _weekStart = State(initialValue: manifest?.weekStart ?? "sunday")
        _calendarSpan = State(initialValue: manifest?.calendarSpan ?? 5)
    }

    var body: some View {
        Section("Manifest") {
            if let errorMessage {
                Text(errorMessage).foregroundStyle(Theme.danger).font(Typography.caption())
            }
            Picker("Week starts", selection: $weekStart) {
                Text("Sunday").tag("sunday")
                Text("Monday").tag("monday")
            }
            Picker("Calendar span", selection: $calendarSpan) {
                Text("3 days").tag(3)
                Text("5 days").tag(5)
                Text("7 days").tag(7)
            }
            Button("Save manifest settings") {
                Task { await save() }
            }
            .disabled(isSaving)
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            _ = try await api.patchSettings(SettingsPatch(
                manifestSettings: ManifestSettings(
                    weekStart: weekStart,
                    calendarSpan: calendarSpan
                )
            ))
            Haptics.success()
            onSaved()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
