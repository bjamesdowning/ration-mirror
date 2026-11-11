import SwiftUI

struct SettingsHelpSection: View {
    var copilotEnabled = false
    var onAskRation: () -> Void = {}

    var body: some View {
        Section {
            Link(destination: AppConfig.userGuideURL) {
                SettingsNavigationLabel(title: "User guide", systemImage: "questionmark.circle")
            }
            if copilotEnabled {
                Button(action: onAskRation) {
                    SettingsNavigationLabel(title: "Ask Ration", systemImage: "questionmark.circle")
                }
                .buttonStyle(.plain)
            } else {
                Label("Ask Ration is unavailable", systemImage: "questionmark.circle")
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .foregroundStyle(Theme.muted)
            }
            Link(destination: URL(string: "mailto:\(AppConfig.supportEmail)")!) {
                SettingsNavigationLabel(title: "Contact support", systemImage: "questionmark.circle")
            }
            Link(destination: AppConfig.blogURL) {
                SettingsNavigationLabel(title: "Visit blog", systemImage: "questionmark.circle")
            }
        } header: {
            SettingsSectionHeader(title: "Help", systemImage: "questionmark.circle")
        }
    }
}
