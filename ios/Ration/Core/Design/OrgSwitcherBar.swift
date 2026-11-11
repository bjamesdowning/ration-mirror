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

/// Group photo, page accessories, and a settings gear. The photo does not open settings.
struct OrgSwitcherBar: View {
    @Environment(AppEnvironment.self) private var env
    var accessories: [PageCapsuleAccessory] = []
    let onSettings: () -> Void
    @State private var showExpandedName = false

    var body: some View {
        HStack(spacing: 0) {
            photo
            ForEach(accessories) { accessory in
                accessoryButton(accessory)
            }
            Button {
                onSettings()
                Haptics.light()
            } label: {
                Image(systemName: "gearshape")
                    .frame(minWidth: 44, minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Settings")
        }
        .padding(.leading, 6)
        .background(Theme.platinum.opacity(0.45), in: Capsule())
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
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(org.name)
            .onLongPressGesture(minimumDuration: 0.35) {
                withAnimation(.easeInOut(duration: 0.2)) {
                    showExpandedName.toggle()
                }
            }
            if showExpandedName {
                Text(org.name)
                    .rationCaption()
                    .lineLimit(1)
                    .frame(maxWidth: 120, alignment: .leading)
                    .accessibilityHidden(true)
            }
        } else if env.session.isLoading {
            ProgressView()
                .controlSize(.small)
                .frame(minWidth: 44, minHeight: 44)
        } else {
            Image(systemName: "building.2")
                .foregroundStyle(Theme.muted)
                .frame(minWidth: 44, minHeight: 44)
                .accessibilityLabel("Group")
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
    /// Page canvas and navigation bar share ceramic. Light stays #F8F9FA.
    func ceramicPageChrome() -> some View {
        background(Theme.ceramic)
            .toolbarBackground(Theme.ceramic, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}
