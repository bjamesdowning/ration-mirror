import SwiftUI
import StoreKit

struct AccountDeletionView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    var onAccountDeleted: (() -> Void)?

    @State private var confirmation = ""
    @State private var isDeleting = false
    @State private var isLoadingPreview = true
    @State private var previewFailed = false
    @State private var errorMessage: String?
    @State private var ownedSoloGroups: [String] = []
    @State private var preview: AccountDeletionPreviewResponse?
    @State private var showingManageSubscriptions = false
    @State private var deletionStartedMessage: String?

    private var isConfirmed: Bool {
        confirmation.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "delete"
    }

    /// Fail closed until preview loads successfully.
    private var canDelete: Bool {
        guard !isLoadingPreview, !previewFailed, let preview else { return false }
        return preview.deletionAllowed
    }

    var body: some View {
        Form {
            Section {
                Text("Deleting your account permanently removes your inventory, meals, supply lists, meal plans, scans, copilot conversations, API keys, sessions, and OAuth grants. Financial ledger records may be anonymized where required by law. Deletion usually finishes within a few minutes; sign-in stays blocked until removal completes.")
                    .font(Typography.body())
            }

            if isLoadingPreview {
                Section {
                    ProgressView("Checking account status…")
                        .tint(Theme.hyperGreen)
                }
            }

            if previewFailed {
                Section {
                    Text("Couldn't load deletion status. Pull to refresh or try again.")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.danger)
                    Button("Retry") {
                        Task { await loadPreview() }
                    }
                }
            }

            if !ownedSoloGroups.isEmpty {
                Section {
                    Text("Groups with no other members will be permanently deleted: \(ownedSoloGroups.joined(separator: ", ")).")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.warning)
                } header: {
                    Text("Groups you own")
                }
            }

            if let preview, !isLoadingPreview {
                Section {
                    Text(preview.message)
                        .font(Typography.caption())
                        .foregroundStyle(canDelete ? Theme.muted : Theme.warning)

                    Text("Subscriptions bought through Apple keep billing until you cancel them, even after your account is deleted. Unused credits are forfeited.")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)

                    if !canDelete {
                        if isAppStoreManaged {
                            Button("Manage Subscription") {
                                showingManageSubscriptions = true
                            }
                        } else {
                            Text("Cancel this membership where you bought it, then return here to delete your account.")
                                .font(Typography.caption())
                                .foregroundStyle(Theme.muted)
                        }
                    }
                } header: {
                    Text("Subscriptions")
                }
            }

            if canDelete {
                Section {
                    TextField("Type delete to confirm", text: $confirmation)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                if preview?.isCancelAtPeriodEnd == true {
                    Section {
                        Text("If you delete now, you lose access to all services immediately — including any remaining days on your cancelled subscription. You can wait until the period ends instead. No refund for unused time.")
                            .font(Typography.caption())
                            .foregroundStyle(Theme.warning)
                    }
                }
            }

            if let errorMessage {
                Section {
                    ErrorBanner(message: errorMessage)
                }
            }

            if canDelete {
                Section {
                    Button("Delete my account", role: .destructive) {
                        Task { await deleteAccount() }
                    }
                    .destructiveDeleteTint()
                    .disabled(!isConfirmed || isDeleting)
                }
            }
        }
        .navigationTitle("Delete Account")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadPreview() }
        .refreshable { await loadPreview() }
        .manageSubscriptionsSheet(isPresented: $showingManageSubscriptions)
        .alert(
            "Account deletion started",
            isPresented: Binding(
                get: { deletionStartedMessage != nil },
                set: { if !$0 { deletionStartedMessage = nil } }
            )
        ) {
            Button("OK") { Task { await finishDeletion() } }
        } message: {
            Text(deletionStartedMessage ?? "")
        }
    }

    @MainActor
    private func loadPreview() async {
        isLoadingPreview = true
        previewFailed = false
        errorMessage = nil
        defer { isLoadingPreview = false }
        do {
            let loaded = try await env.api.accountDeletionPreview()
            preview = loaded
            ownedSoloGroups = loaded.ownedGroupsWithNoOtherMembers
        } catch {
            preview = nil
            previewFailed = true
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private var isAppStoreManaged: Bool {
        let provider = preview?.billingProvider?.lowercased()
        return provider == "app_store" || provider == "mac_app_store"
    }

    @MainActor
    private func finishDeletion() async {
        await env.auth.signOutLocal()
        onAccountDeleted?()
        dismiss()
    }

    @MainActor
    private func deleteAccount() async {
        guard isConfirmed, canDelete else { return }
        isDeleting = true
        errorMessage = nil
        defer { isDeleting = false }
        do {
            let response = try await env.api.deleteAccount()
            deletionStartedMessage = response.message
                ?? String(localized: "Your account is being deleted. This usually finishes within a few minutes.")
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            if let apiError = error as? APIError, apiError.code == "active_subscription" {
                await loadPreview()
            }
        }
    }
}
