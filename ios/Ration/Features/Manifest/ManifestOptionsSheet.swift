import SwiftUI

/// Manifest-specific options — share link with web parity UI.
struct ManifestOptionsSheet: View {
    @Environment(\.dismiss) private var dismiss
    var shareURL: String?
    var shareExpiresAt: String?
    var isLoadingShare: Bool = false
    var onShare: () async -> Void = {}
    var onRevokeShare: () async -> Void = {}
    var onUpgradeRequired: () -> Void = {}

    var body: some View {
        NavigationStack {
            List {
                ShareLinkSection(
                    shareURL: shareURL,
                    shareExpiresAt: shareExpiresAt,
                    capabilities: [
                        "Viewers can see your meal plan",
                        "They cannot edit your plan",
                    ],
                    isLoading: isLoadingShare,
                    onGenerate: onShare,
                    onRevoke: onRevokeShare
                )
            }
            .navigationTitle("Manifest options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
