import SwiftUI

/// Standard page toolbar: org switcher leading; options + profile trailing.
struct GlobalPageToolbar: ToolbarContent {
    var hasActiveFilters: Bool = false
    var onOptions: (() -> Void)?
    var onOpenSettings: () -> Void
    @Environment(AppEnvironment.self) private var env

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            OrgSwitcherBar()
        }
        ToolbarItem(placement: .topBarTrailing) {
            HStack(spacing: 12) {
                if let onOptions {
                    PageOptionsButton(hasActiveFilters: hasActiveFilters, action: onOptions)
                }
                ProfileAvatarButton(imageURL: env.session.userImageURL, action: onOpenSettings)
            }
        }
    }
}

struct PageOptionsButton: View {
    let hasActiveFilters: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .foregroundStyle(hasActiveFilters ? Theme.hyperGreen : Theme.carbon)
                .overlay {
                    if hasActiveFilters {
                        Circle()
                            .stroke(Theme.hyperGreen, lineWidth: 1.5)
                            .padding(-4)
                    }
                }
        }
        .accessibilityLabel("Filters and options")
    }
}
