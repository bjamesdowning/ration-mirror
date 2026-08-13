import SwiftUI

struct GroupDeleteCreditConfirmSheet: View {
    let credits: Int
    let canTransfer: Bool
    let isDeleting: Bool
    let onTransfer: () -> Void
    let onDelete: (Bool) async -> Void
    let onCancel: () -> Void

    @State private var acknowledged = false
    @State private var confirmText = ""

    private var canSubmit: Bool {
        acknowledged && GroupSettingsSupport.isTypedDeleteConfirm(confirmText) && !isDeleting
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(GroupSettingsSupport.groupDeleteCreditWarning(
                        credits: credits,
                        canTransfer: canTransfer
                    ))
                    .font(Typography.body())
                    .foregroundStyle(Theme.carbon)

                    Text("All members will lose access immediately. This cannot be undone.")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                }

                Section {
                    Toggle(isOn: $acknowledged) {
                        Text(GroupSettingsSupport.creditForfeitAcknowledgeLabel)
                            .font(Typography.caption())
                            .foregroundStyle(Theme.carbon)
                    }
                    .tint(Theme.danger)
                    .accessibilityLabel(GroupSettingsSupport.creditForfeitAcknowledgeLabel)
                }

                if canTransfer {
                    Section {
                        Button("Transfer credits") {
                            onTransfer()
                        }
                        .foregroundStyle(Theme.hyperGreen)
                    }
                }

                Section {
                    TextField("Type delete to confirm", text: $confirmText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(Typography.body())
                }

                Section {
                    Button(isDeleting ? "Deleting…" : "Delete Group", role: .destructive) {
                        Task { await onDelete(true) }
                    }
                    .destructiveDeleteTint()
                    .disabled(!canSubmit)
                }
            }
            .navigationTitle("Delete this group permanently?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { onCancel() }
                        .foregroundStyle(Theme.hyperGreen)
                }
            }
            .background(Theme.ceramic)
        }
        .presentationDetents([.large])
        .interactiveDismissDisabled(isDeleting)
    }
}
