import SwiftUI
import PhotosUI

struct SettingsAvatarSection: View {
    @Environment(AppEnvironment.self) private var env
    let title: String
    let imageURL: URL?
    var upload: (Data, String) async throws -> Void

    @State private var pickerItem: PhotosPickerItem?
    @State private var isUploading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).rationCaption()
            HStack(spacing: 12) {
                if let url = imageURL {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFill()
                        default:
                            Image(systemName: "photo").foregroundStyle(Theme.muted)
                        }
                    }
                    .frame(width: 48, height: 48)
                    .clipShape(Circle())
                }
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Text(isUploading ? "Uploading…" : "Choose photo")
                        .rationBody()
                        .foregroundStyle(Theme.hyperGreen)
                }
                .disabled(isUploading)
            }
            if let errorMessage {
                Text(errorMessage).rationCaption().foregroundStyle(Theme.danger)
            }
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { await handleSelection(item) }
        }
    }

    private func handleSelection(_ item: PhotosPickerItem) async {
        isUploading = true
        errorMessage = nil
        defer { isUploading = false }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { return }
            try await upload(data, "image/jpeg")
            // Drop this section's cached image so the post-upload session reload
            // re-fetches the new asset. Org logos are the only auth-cached URLs;
            // the user avatar (public) refreshes via its cache-busted query.
            if let url = imageURL {
                AuthImageLoader.shared.invalidate(url: url)
            }
            await env.session.load(api: env.api)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct SettingsHelpSection: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        Section("Help & Feedback") {
            Link("Email support", destination: URL(string: "mailto:\(AppConfig.supportEmail)")!)
            Link("Report a bug", destination: AppConfig.gitlabIssuesURL)
            Link("Developer MCP setup", destination: AppConfig.helpDocsURL)
            Link("Visit blog", destination: AppConfig.blogURL)
            Link("Account & billing on web", destination: AppConfig.webOriginURL)
        }
    }
}
