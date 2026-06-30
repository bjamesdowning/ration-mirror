import SwiftUI

struct ShareLinkSection: View {
    let shareURL: String?
    let shareExpiresAt: String?
    let capabilities: [String]
    var isLoading: Bool = false
    var onGenerate: () async -> Void
    var onRevoke: () async -> Void

    @State private var copied = false
    @State private var isWorking = false
    @State private var showRevokeConfirm = false

    private var hasActiveLink: Bool {
        guard let shareURL, !shareURL.isEmpty else { return false }
        return true
    }

    var body: some View {
        Section {
            if isLoading {
                HStack {
                    ProgressView()
                    Text("Loading share status…").rationCaption()
                }
            } else if hasActiveLink, let shareURL {
                HStack {
                    Text("Active")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundStyle(Color.black)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Theme.hyperGreen)
                        .clipShape(Capsule())
                    Spacer()
                }

                Text(shareURL)
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .lineLimit(3)

                Button {
                    UIPasteboard.general.string = shareURL
                    copied = true
                    Haptics.success()
                    Task {
                        try? await Task.sleep(nanoseconds: 2_000_000_000)
                        copied = false
                    }
                } label: {
                    Label(copied ? "Copied!" : "Copy link", systemImage: copied ? "checkmark" : "doc.on.doc")
                }

                if let expiryText = expiryDescription {
                    Text(expiryText)
                        .rationCaption()
                        .foregroundStyle(Theme.warning)
                }

                if !capabilities.isEmpty {
                    ForEach(capabilities, id: \.self) { item in
                        Label(item, systemImage: "checkmark.circle")
                            .rationCaption()
                    }
                }

                Button(role: .destructive) {
                    showRevokeConfirm = true
                } label: {
                    Label("Revoke share link", systemImage: "xmark.circle")
                }
                .disabled(isWorking)
            } else {
                Text("Generate a link to share with others. Links expire after 7 days.")
                    .rationCaption()
                Button {
                    Task {
                        isWorking = true
                        await onGenerate()
                        isWorking = false
                    }
                } label: {
                    Label(isWorking ? "Generating…" : "Generate share link", systemImage: "link")
                }
                .disabled(isWorking)
            }
        } header: {
            Text("Sharing")
        }
        .confirmationDialog(
            "Revoke this share link?",
            isPresented: $showRevokeConfirm,
            titleVisibility: .visible
        ) {
            Button("Revoke", role: .destructive) {
                Task {
                    isWorking = true
                    await onRevoke()
                    isWorking = false
                }
            }
        } message: {
            Text("Anyone with the link will no longer be able to access it.")
        }
    }

    private var expiryDescription: String? {
        guard let shareExpiresAt,
              let date = ISO8601DateFormatter().date(from: shareExpiresAt)
        else {
            return hasActiveLink ? "Link expires 7 days after creation." : nil
        }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return "Expires \(formatter.localizedString(for: date, relativeTo: Date()))."
    }
}

struct ShareLinkSheetContent: View {
    let shareURL: String?
    let shareExpiresAt: String?
    let capabilities: [String]
    var isLoading: Bool = false
    var onGenerate: () async -> Void
    var onRevoke: () async -> Void
    var onUpgradeRequired: () -> Void = {}

    var body: some View {
        List {
            ShareLinkSection(
                shareURL: shareURL,
                shareExpiresAt: shareExpiresAt,
                capabilities: capabilities,
                isLoading: isLoading,
                onGenerate: onGenerate,
                onRevoke: onRevoke
            )
        }
    }
}
