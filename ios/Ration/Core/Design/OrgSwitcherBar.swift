import SwiftUI

/// Global org context control — avatar, credits, tier pill; tap to switch orgs.
struct OrgSwitcherBar: View {
    @Environment(AppEnvironment.self) private var env
    @State private var showOrgSheet = false
    @State private var showExpandedName = false

    private var tierLabel: String { env.session.isCrewMember ? "CREW" : "FREE" }

    var body: some View {
        Button {
            showOrgSheet = true
            Haptics.light()
        } label: {
            HStack(spacing: 8) {
                if let org = env.session.activeOrg {
                    OrgAvatar(
                        name: org.name,
                        orgId: org.id,
                        imageURL: org.logo,
                        size: 28
                    )
                    if showExpandedName {
                        Text(org.name)
                            .rationCaption()
                            .lineLimit(1)
                            .frame(maxWidth: 120, alignment: .leading)
                    }
                    HStack(spacing: 4) {
                        Image(systemName: "diamond.fill")
                            .font(.system(size: 8))
                            .foregroundStyle(Theme.hyperGreen)
                        Text("\(env.session.credits) credits")
                            .font(Typography.caption())
                            .foregroundStyle(Theme.muted)
                    }
                    Text(tierLabel)
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(env.session.isCrewMember ? Theme.carbon : Theme.muted)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Theme.platinum)
                        .clipShape(Capsule())
                } else if env.session.isLoading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: "building.2")
                        .foregroundStyle(Theme.muted)
                }
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Theme.surface)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(Theme.platinum, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Organization switcher")
        .accessibilityHint("\(env.session.credits) credits, \(tierLabel) tier. Tap to switch organization.")
        .sheet(isPresented: $showOrgSheet) {
            orgSheet
        }
        .onLongPressGesture(minimumDuration: 0.35) {
            withAnimation(.easeInOut(duration: 0.2)) {
                showExpandedName.toggle()
            }
        }
    }

    private var orgSheet: some View {
        NavigationStack {
            List {
                if let org = env.session.activeOrg {
                    Section {
                        HStack(spacing: 12) {
                            OrgAvatar(name: org.name, orgId: org.id, imageURL: org.logo, size: 44)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(org.name).rationHeadline()
                                Text("\(env.session.credits) credits · \(tierLabel)")
                                    .rationCaption()
                            }
                        }
                        .padding(.vertical, 4)

                        if org.canManageLogo {
                            AvatarUploadPicker(
                                title: "Group photo",
                                imageURL: AvatarURLResolver.resolve(org.logo),
                                usesAuthenticatedImage: true,
                                size: 48,
                                upload: { data, mime in
                                    _ = try await env.api.uploadOrganizationAvatar(imageData: data, mimeType: mime)
                                }
                            )
                            .listRowBackground(Color.clear)
                        }
                    }
                }
                if let orgs = env.session.session?.organizations, orgs.count > 1 {
                    Section("Switch organization") {
                        ForEach(orgs) { org in
                            Button {
                                Task { await switchOrg(org) }
                            } label: {
                                HStack {
                                    OrgAvatar(name: org.name, orgId: org.id, imageURL: org.logo, size: 32)
                                    Text(org.name)
                                        .foregroundStyle(Theme.carbon)
                                    Spacer()
                                    if org.isActive {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(Theme.hyperGreen)
                                    }
                                }
                            }
                            .disabled(org.isActive || env.session.isSwitchingOrg)
                        }
                    }
                }
            }
            .navigationTitle("Organization")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showOrgSheet = false }
                }
            }
            .overlay {
                if env.session.isSwitchingOrg {
                    ProgressView("Switching…")
                        .padding()
                        .background(.ultraThinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    @MainActor
    private func switchOrg(_ org: OrgMembership) async {
        do {
            try await env.session.activateOrg(org, api: env.api, auth: env.auth, snapshots: env.snapshots)
            showOrgSheet = false
            Haptics.success()
        } catch {
            Haptics.error()
        }
    }
}
