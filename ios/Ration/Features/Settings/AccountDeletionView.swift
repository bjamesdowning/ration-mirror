import SwiftUI

struct AccountDeletionView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    var onAccountDeleted: (() -> Void)?

    @State private var confirmation = ""
    @State private var isDeleting = false
    @State private var errorMessage: String?
    @State private var ownedSoloGroups: [String] = []

    private var isConfirmed: Bool {
        confirmation.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "delete"
    }

    var body: some View {
        Form {
            Section {
                Text("Deleting your account permanently removes your inventory, meals, supply lists, meal plans, scans, copilot conversations, API keys, and sessions. Financial ledger records may be anonymized where required by law.")
                    .font(Typography.body())
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

            Section {
                Text("Apple subscriptions must be canceled in App Store account settings. Web Stripe subscriptions must be managed at ration.mayutic.com.")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
            } header: {
                Text("Subscriptions")
            }

            Section {
                TextField("Type delete to confirm", text: $confirmation)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }

            if let errorMessage {
                Section {
                    ErrorBanner(message: errorMessage)
                }
            }

            Section {
                Button("Delete my account", role: .destructive) {
                    Task { await deleteAccount() }
                }
                .destructiveDeleteTint()
                .disabled(!isConfirmed || isDeleting)
            }
        }
        .navigationTitle("Delete Account")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadPreview() }
    }

    @MainActor
    private func loadPreview() async {
        do {
            let preview = try await env.api.accountDeletionPreview()
            ownedSoloGroups = preview.ownedGroupsWithNoOtherMembers
        } catch {
            // Non-blocking — deletion still works without preview data.
        }
    }

    @MainActor
    private func deleteAccount() async {
        guard isConfirmed else { return }
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
        }
    }
}
