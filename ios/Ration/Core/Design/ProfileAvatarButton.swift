import SwiftUI

/// User profile avatar — opens Settings; falls back to SF Symbol when no image.
struct ProfileAvatarButton: View {
    let imageURL: URL?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
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
        .accessibilityLabel("Account and settings")
    }

    private var fallbackIcon: some View {
        Image(systemName: "person.crop.circle.fill")
            .resizable()
            .scaledToFit()
            .foregroundStyle(Theme.muted)
    }
}
