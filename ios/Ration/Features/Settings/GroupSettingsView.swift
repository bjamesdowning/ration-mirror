import SwiftUI
import UIKit

struct GroupSettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = GroupSettingsViewModel()
    @State private var showingPaywall = false
    @State private var showingDeleteConfirm = false
    @State private var deleteConfirmText = ""
    @State private var showingTransferConfirm = false
    @State private var transferConfirmText = ""
    @State private var selectedTransferMemberId = ""

    @State private var supplyWindow: SupplyPlanningWindow?
    @State private var isLoadingSupplySettings = false
    @State private var supplySettingsError: String?

    private var tierLabel: String { env.session.isCrewMember ? "CREW" : "FREE" }

    private var isCrewMember: Bool {
        model.session?.isCrewMember ?? env.session.isCrewMember
    }

    private var canCreateGroup: Bool {
        guard let session = model.session else { return true }
        return GroupSettingsSupport.canCreateGroup(
            organizations: session.organizations,
            isCrewMember: isCrewMember
        )
    }

    private var ownedGroupLimit: Int {
        GroupSettingsSupport.maxOwnedGroups(isCrewMember: isCrewMember)
    }

    private var createGroupFooter: String? {
        guard let session = model.session else { return nil }
        guard !GroupSettingsSupport.canCreateGroup(
            organizations: session.organizations,
            isCrewMember: isCrewMember
        ) else { return nil }
        return GroupSettingsSupport.ownedGroupLimitMessage(
            limit: ownedGroupLimit,
            isCrewMember: isCrewMember
        )
    }

    var body: some View {
        Group {
            if model.isLoading, model.session == nil {
                LoadingView()
            } else {
                content
            }
        }
        .navigationTitle("Group Settings")
        .navigationBarTitleDisplayMode(.inline)
        .background(Theme.ceramic)
        .task { await model.load(api: env.api) }
        .task { await loadSupplySettings() }
        .refreshable { await model.load(api: env.api) }
        .sheet(isPresented: $showingPaywall) { PaywallView() }
        .alert("Delete this group permanently?", isPresented: $showingDeleteConfirm) {
            TextField("Type delete to confirm", text: $deleteConfirmText)
                .textInputAutocapitalization(.never)
            Button("Delete Group", role: .destructive) {
                Task {
                    guard deleteConfirmText == "delete" else { return }
                    switch await model.deleteGroup(api: env.api, env: env) {
                    case .needsOrgSelection:
                        dismiss()
                    case .failure:
                        break
                    }
                }
            }
            Button("Cancel", role: .cancel) { deleteConfirmText = "" }
        } message: {
            Text("All members will lose access immediately. This cannot be undone.")
        }
        .alert("Transfer ownership?", isPresented: $showingTransferConfirm) {
            TextField("Type transfer to confirm", text: $transferConfirmText)
                .textInputAutocapitalization(.never)
            Button("Transfer Ownership") {
                Task {
                    guard transferConfirmText == "transfer", !selectedTransferMemberId.isEmpty else { return }
                    let succeeded = await model.transferOwnership(
                        to: selectedTransferMemberId,
                        api: env.api,
                        env: env
                    )
                    if succeeded {
                        transferConfirmText = ""
                        selectedTransferMemberId = ""
                    }
                }
            }
            Button("Cancel", role: .cancel) {
                transferConfirmText = ""
                selectedTransferMemberId = ""
            }
        } message: {
            Text("You will become a regular member. Group limits will follow the new owner's tier.")
        }
    }

    @ViewBuilder
    private var content: some View {
        List {
            if let error = model.errorMessage {
                Section {
                    Text(error).foregroundStyle(Theme.danger).font(Typography.caption())
                }
            }
            if let success = model.successMessage {
                Section {
                    Text(success).foregroundStyle(Theme.hyperGreen).font(Typography.caption())
                }
            }

            activeOrgSection

            supplyPlanningSection

            if let session = model.session, session.organizations.count > 1 {
                orgSwitcherSection(session)
            }

            createGroupSection

            membersSection

            if env.session.activeOrg?.canManageLogo == true {
                Section("Tags") {
                    NavigationLink("Manage tags") {
                        TagsSettingsView()
                    }
                }
            }

            if let session = model.session,
               GroupSettingsSupport.canTransferCredits(organizations: session.organizations)
            {
                TransferCreditsSection(
                    organizations: session.organizations,
                    api: env.api,
                    onTransferred: { Task { await model.load(api: env.api) } }
                )
            }

            if GroupSettingsSupport.canTransferOwnership(
                isOwner: model.isOwner,
                nonOwnerMemberCount: model.nonOwnerMembers.count
            ) {
                transferOwnershipSection
            }

            if GroupSettingsSupport.canDeleteGroup(
                isOwner: model.isOwner,
                isPersonalGroup: env.session.activeOrg?.isPersonalGroup == true
            ) {
                deleteGroupSection
            } else if model.isOwner, env.session.activeOrg?.isPersonalGroup == true {
                personalGroupDeleteBlockedSection
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .overlay {
            if env.session.isSwitchingOrg {
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

    @ViewBuilder
    private var supplyPlanningSection: some View {
        Section("Supply planning") {
            if let supplySettingsError {
                Text(supplySettingsError)
                    .foregroundStyle(Theme.danger)
                    .font(Typography.caption())
            }
            if let supplyWindow {
                Text("Including Manifest meals through \(HubDateFormat.smartLabel(isoDate: supplyWindow.endDate)) (\(supplyWindow.horizonDays) days)")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
            }
            if env.session.activeOrg?.canManageSupplySettings == true {
                Picker("Planning horizon", selection: horizonBinding) {
                    ForEach([7, 14, 21, 30], id: \.self) { days in
                        Text("\(days) days").tag(days)
                    }
                }
                .disabled(isLoadingSupplySettings)
            } else {
                Text("Only group owners and admins can change the planning horizon.")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    private var horizonBinding: Binding<Int> {
        Binding(
            get: { supplyWindow?.horizonDays ?? 7 },
            set: { newValue in
                guard newValue != supplyWindow?.horizonDays else { return }
                Task { await patchHorizon(newValue) }
            }
        )
    }

    private func loadSupplySettings() async {
        guard env.network.isOnline else { return }
        do {
            let response = try await env.api.organizationSupplySettings()
            supplyWindow = response.window
        } catch {
            supplySettingsError = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func patchHorizon(_ days: Int) async {
        isLoadingSupplySettings = true
        supplySettingsError = nil
        defer { isLoadingSupplySettings = false }
        do {
            let response = try await env.api.patchOrganizationSupplySettings(manifestHorizonDays: days)
            supplyWindow = response.window
            Haptics.success()
        } catch {
            supplySettingsError = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @ViewBuilder
    private var activeOrgSection: some View {
        if let org = env.session.activeOrg {
            Section {
                HStack(spacing: 12) {
                    OrgAvatar(name: org.name, orgId: org.id, imageURL: org.logo, size: 44)
                    VStack(alignment: .leading, spacing: 4) {
                        if org.canManageGroupProfile {
                            TextField("Group name", text: $model.editedGroupName)
                                .rationHeadline()
                            Button(model.isSavingGroupName ? "Saving…" : "Save name") {
                                Task { _ = await model.saveGroupName(api: env.api, env: env) }
                            }
                            .buttonStyle(.borderless)
                            .font(Typography.caption())
                            .foregroundStyle(Theme.hyperGreen)
                            .disabled(
                                model.isSavingGroupName
                                    || model.editedGroupName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                    || model.editedGroupName.trimmingCharacters(in: .whitespacesAndNewlines) == org.name
                            )
                        } else {
                            Text(org.name).rationHeadline()
                        }
                        Text("\(env.session.credits) credits · \(tierLabel)")
                            .rationCaption()
                            .foregroundStyle(Theme.muted)
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
    }

    @ViewBuilder
    private func orgSwitcherSection(_ session: SessionResponse) -> some View {
        Section("Switch group") {
            ForEach(session.organizations) { org in
                Button {
                    Task { await model.activateOrg(org, env: env) }
                } label: {
                    HStack {
                        OrgAvatar(name: org.name, orgId: org.id, imageURL: org.logo, size: 32)
                        Text(org.name).foregroundStyle(Theme.carbon)
                        Spacer()
                        if org.isActive {
                            Image(systemName: "checkmark").foregroundStyle(Theme.hyperGreen)
                        }
                    }
                }
                .disabled(org.isActive || env.session.isSwitchingOrg)
            }
        }
    }

    @ViewBuilder
    private var createGroupSection: some View {
        Section {
            if let error = model.createGroupError {
                ErrorBanner(message: error)
            }
            TextField("Group name", text: $model.newGroupName)
            Button(model.isCreatingGroup ? "Creating…" : "Create group") {
                Task {
                    switch await model.createGroup(api: env.api, env: env) {
                    case .success, .failure, .crewGroupLimitReached:
                        break
                    case .showPaywall:
                        showingPaywall = true
                    }
                }
            }
            .disabled(model.isCreatingGroup || !canCreateGroup)
            .foregroundStyle(canCreateGroup ? Theme.hyperGreen : Theme.muted)
        } header: {
            Text("Create group")
        } footer: {
            if let footer = createGroupFooter {
                Text(footer)
            }
        }
    }

    @ViewBuilder
    private var membersSection: some View {
        Section {
            if GroupSettingsSupport.canShowInviteButton(currentUserRole: model.currentUserRole) {
                Button(model.isInviting ? "Creating invite…" : "Invite member") {
                    Task {
                        let needsPaywall = !(await model.inviteMember(api: env.api))
                        if needsPaywall, model.errorMessage == nil {
                            showingPaywall = true
                        }
                    }
                }
                .disabled(model.isInviting)
                .foregroundStyle(Theme.hyperGreen)
            }

            if let link = model.inviteLink {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Share this link")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                    Text(link)
                        .font(Typography.mono(12))
                        .foregroundStyle(Theme.carbon)
                        .textSelection(.enabled)
                    Button("Copy link") {
                        UIPasteboard.general.string = link
                        Haptics.light()
                    }
                    .font(Typography.caption())
                    .foregroundStyle(Theme.hyperGreen)
                }
                .padding(.vertical, 4)
            }

            ForEach(model.members) { member in
                memberRow(member)
            }
        } header: {
            Text("Members")
        } footer: {
            Text("Manage who has access to this group's cargo.")
        }
    }

    @ViewBuilder
    private func memberRow(_ member: GroupMember) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(GroupSettingsSupport.memberDisplayName(member.user))
                    .foregroundStyle(Theme.carbon)
                Text(member.user.email)
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            roleControl(for: member)
        }
    }

    @ViewBuilder
    private func roleControl(for member: GroupMember) -> some View {
        if !GroupSettingsSupport.canManageMemberRole(
            currentUserRole: model.currentUserRole,
            targetRole: member.role
        ) {
            Text(member.role.capitalized)
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Theme.platinum.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 6))
        } else if GroupSettingsSupport.adminPromoteOnly(
            currentUserRole: model.currentUserRole,
            targetRole: member.role
        ) {
            Button(model.updatingMemberId == member.id ? "Updating…" : "Promote to Admin") {
                Task { await model.updateRole(memberId: member.id, role: "admin", api: env.api) }
            }
            .font(Typography.caption())
            .foregroundStyle(Theme.hyperGreen)
            .disabled(model.updatingMemberId == member.id)
        } else {
            Picker("Role", selection: Binding(
                get: { member.role },
                set: { newRole in
                    guard newRole != member.role else { return }
                    Task { await model.updateRole(memberId: member.id, role: newRole, api: env.api) }
                }
            )) {
                ForEach(GroupSettingsSupport.rolePickerOptions(currentUserRole: model.currentUserRole), id: \.self) { role in
                    Text(role.capitalized).tag(role)
                }
            }
            .pickerStyle(.menu)
            .disabled(model.updatingMemberId == member.id)
        }
    }

    @ViewBuilder
    private var transferOwnershipSection: some View {
        Section {
            if let error = model.transferError {
                ErrorBanner(message: error)
            }
            Picker("New owner", selection: $selectedTransferMemberId) {
                Text("Select member").tag("")
                ForEach(model.nonOwnerMembers) { member in
                    Text(GroupSettingsSupport.memberDisplayName(member.user)).tag(member.id)
                }
            }
            Button("Transfer ownership") {
                showingTransferConfirm = true
            }
            .disabled(selectedTransferMemberId.isEmpty)
            .foregroundStyle(Theme.warning)
        } header: {
            Text("Transfer ownership")
        } footer: {
            Text("Hand off this group to another member. You will become a regular member.")
        }
    }

    @ViewBuilder
    private var personalGroupDeleteBlockedSection: some View {
        Section {
            Text("Your personal group can't be deleted. To remove all your data, delete your account instead.")
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
        } header: {
            Text("Danger zone")
        }
    }

    @ViewBuilder
    private var deleteGroupSection: some View {
        Section {
            Button("Delete group", role: .destructive) {
                deleteConfirmText = ""
                showingDeleteConfirm = true
            }
            .destructiveDeleteTint()
        } header: {
            Text("Danger zone")
        } footer: {
            Text("Permanently delete this group and all its data. You will return to the group picker immediately. This cannot be undone.")
        }
    }
}

struct TransferCreditsSection: View {
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

    private var maxAmount: Int {
        let sourceCredits = sourceOrgs.first(where: { $0.id == sourceId })?.credits ?? 0
        return min(max(sourceCredits, 1), 10_000)
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
            .onChange(of: sourceId) { _, _ in
                amount = min(max(amount, 1), maxAmount)
            }
            Picker("To", selection: $destinationId) {
                Text("Select destination").tag("")
                ForEach(destinationOrgs) { org in
                    Text(org.name).tag(org.id)
                }
            }
            TextField("Amount", value: $amount, format: .number)
                .keyboardType(.numberPad)
            if !sourceId.isEmpty {
                Text("Max: \(maxAmount) CR")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
            }
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
            amount = min(max(amount, 1), maxAmount)
        }
    }

    private func transfer() async {
        isTransferring = true
        errorMessage = nil
        successMessage = nil
        defer { isTransferring = false }
        let clampedAmount = min(max(amount, 1), maxAmount)
        amount = clampedAmount
        do {
            _ = try await api.transferCredits(
                sourceOrganizationId: sourceId,
                destinationOrganizationId: destinationId,
                amount: clampedAmount
            )
            successMessage = "Credits transferred"
            Haptics.success()
            onTransferred()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
