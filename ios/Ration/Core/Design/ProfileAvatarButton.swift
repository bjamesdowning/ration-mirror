import SwiftUI

/// User profile avatar — opens Settings; optional photo change menu.
struct ProfileAvatarButton: View {
    @Environment(AppEnvironment.self) private var env
    let imageURL: URL?
    let action: () -> Void

    @State private var showingPhotoPicker = false

    var body: some View {
        Menu {
            Button("Account settings", action: action)
            Button("Change photo") { showingPhotoPicker = true }
        } label: {
            avatarContent
        }
        .accessibilityLabel("Account and settings")
        .sheet(isPresented: $showingPhotoPicker) {
            NavigationStack {
                VStack(spacing: 20) {
                    AvatarUploadPicker(
                        title: "Profile photo",
                        imageURL: imageURL,
                        upload: { data, mime in
                            _ = try await env.api.uploadUserAvatar(imageData: data, mimeType: mime)
                        }
                    )
                    Spacer()
                }
                .padding(24)
                .background(Theme.ceramic)
                .navigationTitle("Change photo")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showingPhotoPicker = false }
                    }
                }
            }
            .presentationDetents([.medium])
        }
    }

    private var avatarContent: some View {
        Group {
            if let url = imageURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        fallbackIcon
                    }
                }
            } else {
                fallbackIcon
            }
        }
        .frame(width: 32, height: 32)
        .clipShape(Circle())
        .overlay(Circle().stroke(Theme.platinum, lineWidth: 1))
    }

    private var fallbackIcon: some View {
        Image(systemName: "person.crop.circle.fill")
            .resizable()
            .scaledToFit()
            .foregroundStyle(Theme.muted)
    }
}
