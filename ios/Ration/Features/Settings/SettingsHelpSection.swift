import SwiftUI

struct SettingsHelpSection: View {
    var body: some View {
        Section("Help & Feedback") {
            Link("User guide", destination: AppConfig.userGuideURL)
            Link("Ask Ration", destination: URL(string: "ration://ask")!)
            Link("Contact support", destination: URL(string: "mailto:\(AppConfig.supportEmail)")!)
            Link("Visit blog", destination: AppConfig.blogURL)
        }
    }
}
