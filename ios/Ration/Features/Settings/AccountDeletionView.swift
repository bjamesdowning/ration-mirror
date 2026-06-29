import SwiftUI

struct AccountDeletionView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    @State private var confirmation = ""
    @State private var isDeleting = false
    @State private var errorMessage: String?

    private let requiredPhrase = "DELETE"

    var body: some View {
        Form {
            Section {
                Text("Deleting your account permanently removes your inventory, meals, supply lists, meal plans, scans, API keys, and sessions. Financial ledger records may be anonymized where required by law.")
                    .font(Typography.body())
            }

            Section {
                Text("Apple subscriptions must be canceled in App Store account settings. Web Stripe subscriptions must be managed at ration.mayutic.com.")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
            } header: {
                Text("Subscriptions")
            }

            Section {
                TextField("Type DELETE to confirm", text: $confirmation)
                    .textInputAutocapitalization(.characters)
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
                .disabled(confirmation != requiredPhrase || isDeleting)
            }
        }
        .navigationTitle("Delete Account")
        .navigationBarTitleDisplayMode(.inline)
    }

    @MainActor
    private func deleteAccount() async {
        guard confirmation == requiredPhrase else { return }
        isDeleting = true
        errorMessage = nil
        defer { isDeleting = false }
        do {
            _ = try await env.api.deleteAccount()
            env.snapshots.clearAll()
            await env.billing.logOut()
            await env.auth.signOut()
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
