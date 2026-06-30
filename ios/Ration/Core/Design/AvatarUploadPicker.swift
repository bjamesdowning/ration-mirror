import SwiftUI
import PhotosUI
import UIKit

enum AvatarImagePrep {
    enum PrepError: LocalizedError {
        case unreadable
        case tooLarge
        case unsupportedFormat

        var errorDescription: String? {
            switch self {
            case .unreadable: return "Could not read the selected image."
            case .tooLarge: return "Image must be 2MB or smaller."
            case .unsupportedFormat: return "Use JPEG, PNG, or WebP."
            }
        }
    }

    static let maxBytes = 2 * 1024 * 1024

    static func prepare(_ data: Data) throws -> (data: Data, mimeType: String) {
        guard let image = UIImage(data: data) else {
            throw PrepError.unreadable
        }

        let prepared = image.resizedJPEG(maxDimension: 1024, quality: 0.85) ?? data
        if prepared.count > maxBytes {
            throw PrepError.tooLarge
        }

        let mime: String
        if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) {
            mime = "image/png"
        } else if data.starts(with: [0x52, 0x49, 0x46, 0x46]) {
            mime = "image/webp"
        } else {
            mime = "image/jpeg"
        }

        return (prepared, mime)
    }
}

struct AvatarUploadPicker: View {
    let title: String
    var imageURL: URL?
    var usesAuthenticatedImage: Bool = false
    var size: CGFloat = 64
    var upload: (Data, String) async throws -> Void

    @Environment(AppEnvironment.self) private var env
    @State private var pickerItem: PhotosPickerItem?
    @State private var isUploading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).rationCaption()
            HStack(spacing: 12) {
                avatarPreview
                VStack(alignment: .leading, spacing: 6) {
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        Text(isUploading ? "Uploading…" : "Choose photo")
                            .rationBody()
                            .foregroundStyle(Theme.hyperGreen)
                    }
                    .disabled(isUploading)
                    Text("JPEG, PNG, or WebP · max 2MB")
                        .rationCaption()
                }
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

    @ViewBuilder
    private var avatarPreview: some View {
        ZStack(alignment: .bottomTrailing) {
            Group {
                if let url = imageURL {
                    if usesAuthenticatedImage {
                        AuthImageView(url: url) {
                            placeholder
                        }
                    } else {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image.resizable().scaledToFill()
                            default:
                                placeholder
                            }
                        }
                    }
                } else {
                    placeholder
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay(Circle().stroke(Theme.platinum, lineWidth: 1))

            Image(systemName: "pencil.circle.fill")
                .font(.system(size: size * 0.28))
                .foregroundStyle(Theme.hyperGreen)
                .background(Circle().fill(Theme.ceramic))
        }
    }

    private var placeholder: some View {
        Image(systemName: "person.crop.circle")
            .resizable()
            .scaledToFit()
            .foregroundStyle(Theme.muted)
            .padding(size * 0.15)
    }

    private func handleSelection(_ item: PhotosPickerItem) async {
        isUploading = true
        errorMessage = nil
        defer { isUploading = false }
        do {
            guard let raw = try await item.loadTransferable(type: Data.self) else { return }
            let prepared = try AvatarImagePrep.prepare(raw)
            try await upload(prepared.data, prepared.mimeType)
            if let url = imageURL {
                AuthImageLoader.shared.invalidate(url: url)
            }
            await env.session.load(api: env.api)
            Haptics.success()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? (error as? APIError)?.errorDescription
                ?? error.localizedDescription
        }
    }
}
