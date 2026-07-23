import SwiftUI

/// Post-delete (or lost-access) group picker — mirrors web `/select-group`.
struct SelectGroupView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var paywallContext: PaywallContext?

    private var organizations: [OrgMembership] {
        env.session.orgSelectionOrganizations ?? []
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 8) {
                        Text("Select Mission Control")
                            .font(Typography.title())
                            .foregroundStyle(Theme.carbon)
                            .multilineTextAlignment(.center)
                        Text("Choose a group to access its Cargo and Supply.")
                            .font(Typography.body())
                            .foregroundStyle(Theme.muted)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 8)

                    if let errorMessage {
                        ErrorBanner(message: errorMessage)
                    }

                    if organizations.isEmpty {
                        emptyState
                    } else {
                        orgList
                    }
                }
                .padding(24)
            }
            .background(Theme.ceramic)
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled()
            .sheet(item: $paywallContext) { ctx in
                PaywallView(context: ctx)
            }
            .overlay {
                if isWorking || env.session.isSwitchingOrg {
                    ProgressView("Switching…")
                        .padding()
                        .background {
                            RationAdaptiveMaterial(
                                shape: AnyShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            )
                        }
                }
            }
        }
    }

    private var orgList: some View {
        VStack(spacing: 12) {
            ForEach(organizations) { org in
                Button {
                    Task { await select(org) }
                } label: {
                    HStack(spacing: 12) {
                        OrgAvatar(name: org.name, orgId: org.id, imageURL: org.logo, size: 40)
                        Text(org.name)
                            .font(Typography.headline())
                            .foregroundStyle(Theme.carbon)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(16)
                    .background(Theme.platinum.opacity(0.3))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .disabled(isWorking || env.session.isSwitchingOrg)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Text("You don't have any groups yet.")
                .font(Typography.body())
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            Button("Create Personal Group") {
                Task { await createPersonalGroup() }
            }
            .buttonStyle(PrimaryButtonStyle(isLoading: isWorking))
            .disabled(isWorking || env.session.isSwitchingOrg)
        }
    }

    private func select(_ org: OrgMembership) async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await env.session.activateOrg(
                org,
                api: env.api,
                auth: env.auth,
                snapshots: env.snapshots
            )
            env.session.completeOrgSelection()
            Haptics.success()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func createPersonalGroup() async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            let response = try await env.api.createGroup(name: "My Personal Group")
            let org = OrgMembership(
                id: response.organizationId,
                name: "My Personal Group",
                slug: nil,
                logo: nil,
                credits: 0,
                role: "owner",
                isActive: false,
                isPersonal: nil
            )
            try await env.session.activateOrg(
                org,
                api: env.api,
                auth: env.auth,
                snapshots: env.snapshots
            )
            env.session.completeOrgSelection()
            Haptics.success()
        } catch let error as APIError {
            if let outcome = GroupSettingsSupport.createGroupOutcome(
                from: error,
                isCrewMember: env.session.isCrewMember
            ) {
                if case .showPaywall = outcome {
                    paywallContext = CapacityUpgrade.context(
                        from: error,
                        isCrewMember: env.session.isCrewMember
                    ) ?? PaywallContext(trigger: .capacity, resource: "owned_groups")
                } else if let message = GroupSettingsSupport.createGroupErrorMessage(from: outcome) {
                    errorMessage = message
                } else {
                    errorMessage = "Upgrade to Crew to create more groups."
                }
                return
            }
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
