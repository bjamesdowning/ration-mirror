import SwiftUI

struct SettingsHelpSection: View {
    var body: some View {
        Section {
            Link(destination: AppConfig.userGuideURL) {
                SettingsNavigationLabel(title: "User guide", systemImage: "questionmark.circle")
            }
            Link(destination: URL(string: "ration://ask")!) {
                SettingsNavigationLabel(title: "Ask Ration", systemImage: "questionmark.circle")
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
