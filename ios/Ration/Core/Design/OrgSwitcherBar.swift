import SwiftUI

/// Global org context control — avatar, credits, tier pill; tap to open Group Settings.
struct OrgSwitcherBar: View {
    @Environment(AppEnvironment.self) private var env
    let onTap: () -> Void
    @State private var showExpandedName = false

    private var tierLabel: String { env.session.isCrewMember ? "CREW" : "FREE" }

    var body: some View {
        Button {
            onTap()
            Haptics.light()
        } label: {
            HStack(spacing: 8) {
                if let org = env.session.activeOrg {
                    OrgAvatar(
                        name: org.name,
                        orgId: org.id,
                        imageURL: org.logo,
                        size: 28
                    )
                    if showExpandedName {
                        Text(org.name)
                            .rationCaption()
                            .lineLimit(1)
                            .frame(maxWidth: 120, alignment: .leading)
                    }
                    HStack(spacing: 4) {
                        Image(systemName: "diamond.fill")
                            .font(.system(size: 8))
                            .foregroundStyle(Theme.hyperGreen)
                        Text("\(env.session.credits) credits")
                            .font(Typography.caption())
                            .foregroundStyle(Theme.muted)
                    }
                    Text(tierLabel)
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(env.session.isCrewMember ? Theme.carbon : Theme.muted)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Theme.platinum)
                        .clipShape(Capsule())
                } else if env.session.isLoading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: "building.2")
                        .foregroundStyle(Theme.muted)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Theme.surface)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(Theme.platinum, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Group settings")
        .accessibilityHint("\(env.session.credits) credits, \(tierLabel) tier. Tap to open group settings.")
        .onLongPressGesture(minimumDuration: 0.35) {
            withAnimation(.easeInOut(duration: 0.2)) {
                showExpandedName.toggle()
            }
        }
    }
}
