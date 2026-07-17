import SwiftUI
import PhotosUI

struct SettingsHelpSection: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        Section("Help & Feedback") {
            Link("User guide", destination: AppConfig.userGuideURL)
            Link("Ask Ration", destination: URL(string: "ration://ask")!)
            Link("Report a bug", destination: AppConfig.gitlabIssuesURL)
            Link("Developer MCP setup", destination: AppConfig.helpDocsURL)
            Link("Visit blog", destination: AppConfig.blogURL)
            Link("Account & billing on web", destination: AppConfig.webOriginURL)
        }
    }
}
