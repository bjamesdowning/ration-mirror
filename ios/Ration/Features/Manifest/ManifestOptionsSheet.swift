import SwiftUI

/// Manifest-specific options — share link wired in Phase 5.
struct ManifestOptionsSheet: View {
    @Environment(\.dismiss) private var dismiss
    var shareURL: String?
    var onShare: () async -> Void = {}
    var onRevokeShare: () async -> Void = {}
    @State private var isWorking = false

    var body: some View {
        NavigationStack {
            List {
                Section("Sharing") {
                    if let shareURL, !shareURL.isEmpty {
                        ShareLink(item: shareURL) {
                            Label("Copy share link", systemImage: "link")
                        }
                        Button(role: .destructive) {
                            Task {
                                isWorking = true
                                await onRevokeShare()
                                isWorking = false
                                dismiss()
                            }
                        } label: {
                            Label("Revoke share link", systemImage: "xmark.circle")
                        }
                        .disabled(isWorking)
                    } else {
                        Button {
                            Task {
                                isWorking = true
                                await onShare()
                                isWorking = false
                            }
                        } label: {
                            Label("Share manifest", systemImage: "square.and.arrow.up")
                        }
                        .disabled(isWorking)
                    }
                }
            }
            .navigationTitle("Manifest options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
