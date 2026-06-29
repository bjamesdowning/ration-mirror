import SwiftUI
import Observation

@MainActor
@Observable
final class SessionViewModel {
    private(set) var session: SessionResponse?
    private(set) var isLoading = false
    var errorMessage: String?

    func load(api: RationAPI) async {
        isLoading = true
        defer { isLoading = false }
        do {
            session = try await api.session()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func activate(_ org: OrgMembership, api: RationAPI, auth: AuthManager) async {
        guard !org.isActive else { return }
        do {
            // Org switch issues a new org-scoped token pair; adopt it, then refresh session.
            let pair = try await api.activateOrg(org.id)
            auth.adopt(pair)
            session = try await api.session()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct SettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var model = SessionViewModel()
    @State private var showingPaywall = false

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
            .background(Theme.ceramic)
            .sheet(isPresented: $showingPaywall) { PaywallView() }
        }
        .task { await model.load(api: env.api) }
    }

    private func content(_ session: SessionResponse) -> some View {
        List {
            Section("Account") {
                LabeledContent("Name", value: session.user.name ?? "—")
                LabeledContent("Email", value: session.user.email)
            }

            Section("Membership") {
                LabeledContent("Tier", value: session.isCrewMember ? "Crew Member" : "Free")
                LabeledContent("Credits", value: "\(session.credits)")
                if !session.isCrewMember {
                    Button("Upgrade to Crew Member") { showingPaywall = true }
                        .foregroundStyle(Theme.hyperGreen)
                } else {
                    Button("Manage / buy credits") { showingPaywall = true }
                        .foregroundStyle(Theme.hyperGreen)
                }
            }

            if session.organizations.count > 1 {
                Section("Organizations") {
                    ForEach(session.organizations) { org in
                        Button { Task { await model.activate(org, api: env.api, auth: env.auth) } } label: {
                            HStack {
                                Text(org.name).foregroundStyle(Theme.carbon)
                                Spacer()
                                if org.isActive {
                                    Image(systemName: "checkmark").foregroundStyle(Theme.hyperGreen)
                                }
                            }
                        }
                    }
                }
            }

            Section {
                Button("Sign out", role: .destructive) {
                    Task { await env.auth.signOut() }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .refreshable { await model.load(api: env.api) }
    }
}
