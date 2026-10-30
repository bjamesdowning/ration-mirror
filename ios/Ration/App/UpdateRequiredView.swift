import SwiftUI

/// Full-screen stop shown when the server no longer supports this build.
struct UpdateRequiredView: View {
    let requirement: AppUpdateRequirement
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: 20) {
            Image("RationMark")
                .resizable()
                .scaledToFit()
                .frame(width: 72, height: 72)
                .accessibilityHidden(true)
            Text("Update Ration")
                .rationTitle()
                .accessibilityAddTraits(.isHeader)
            Text(requirement.message)
                .rationBody()
                .multilineTextAlignment(.center)
            Button("Open the App Store") {
                openURL(requirement.appStoreURL)
            }
            .buttonStyle(PrimaryButtonStyle())
            .accessibilityIdentifier("updateRequired.openAppStore")
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.ceramic)
    }
}
