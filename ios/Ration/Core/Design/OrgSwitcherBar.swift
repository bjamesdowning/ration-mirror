import SwiftUI

/// One control inside the top-left capsule. It is not part of the photo or the gear.
struct PageCapsuleAccessory: Identifiable {
    let id: String
    let systemImage: String
    let label: String
    var hint: String?
    var value: String?
    var isEnabled: Bool = true
    let action: () -> Void
}

/// Group photo and settings gear in one button, then page accessories.
struct OrgSwitcherBar: View {
    @Environment(AppEnvironment.self) private var env
    var accessories: [PageCapsuleAccessory] = []
    let onSettings: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            settingsButton
            ForEach(accessories) { accessory in
                accessoryButton(accessory)
            }
        }
        .padding(.leading, 6)
        .background(Theme.platinum.opacity(0.45), in: Capsule())
    }

    private var settingsButton: some View {
        Button {
            onSettings()
            Haptics.light()
        } label: {
            HStack(spacing: 0) {
                photo
                Image(systemName: "gearshape")
                    .frame(minWidth: 44, minHeight: 44)
            }
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Settings")
        .accessibilityValue(env.session.activeOrg?.name ?? "")
    }

    @ViewBuilder
    private var photo: some View {
        if let org = env.session.activeOrg {
            OrgAvatar(
                name: org.name,
                orgId: org.id,
                imageURL: org.logo,
                size: 28
            )
            .padding(.horizontal, 6)
            .accessibilityHidden(true)
        } else if env.session.isLoading {
            ProgressView()
                .controlSize(.small)
                .frame(minWidth: 44, minHeight: 44)
                .accessibilityHidden(true)
        } else {
            Image(systemName: "building.2")
                .foregroundStyle(Theme.muted)
                .frame(minWidth: 44, minHeight: 44)
                .accessibilityHidden(true)
        }
    }

    private func accessoryButton(_ accessory: PageCapsuleAccessory) -> some View {
        Button(action: accessory.action) {
            Image(systemName: accessory.systemImage)
                .frame(minWidth: 44, minHeight: 44)
        }
        .buttonStyle(.plain)
        .disabled(!accessory.isEnabled)
        .accessibilityLabel(accessory.label)
        .accessibilityHint(accessory.hint ?? "")
        .accessibilityValue(accessory.value ?? "")
    }
}

extension View {
    /// Page canvas is ceramic. The bar color and both title styles come from `NavigationTitleChrome`.
    func ceramicPageChrome() -> some View {
        background(Theme.ceramic)
            .background {
                NavigationTitleChromeInstaller()
            }
    }

    /// Large title on a page root. Detail and modal screens stay inline.
    func rationLargeTitle() -> some View {
        navigationBarTitleDisplayMode(.large)
    }
}
