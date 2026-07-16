import SwiftUI
import StoreKit
import UIKit

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
                Text("Deleting your account permanently removes your inventory, meals, supply lists, meal plans, scans, copilot conversations, API keys, and sessions. Financial ledger records may be anonymized where required by law.")
                    .font(Typography.body())
            }

            if isLoadingPreview {
                Section {
                    ProgressView("Checking account status…")
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

                    if !canDelete {
                        Button("Manage Subscription") {
                            Task { await openManageSubscriptions() }
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

    @MainActor
    private func openManageSubscriptions() async {
        if let urlString = preview?.managementUrl, let url = URL(string: urlString) {
            await UIApplication.shared.open(url)
            return
        }
        if let windowScene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first
        {
            try? await AppStore.showManageSubscriptions(in: windowScene)
        }
    }

    @MainActor
    private func deleteAccount() async {
        guard isConfirmed, canDelete else { return }
        isDeleting = true
        errorMessage = nil
        defer { isDeleting = false }
        do {
            _ = try await env.api.deleteAccount()
            await env.auth.signOutLocal()
            onAccountDeleted?()
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            if let apiError = error as? APIError, apiError.code == "active_subscription" {
                await loadPreview()
            }
        }
    }
}
