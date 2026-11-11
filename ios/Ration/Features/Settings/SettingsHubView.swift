import SwiftUI

enum SettingsHubSegment: String, CaseIterable, Identifiable {
    case profile
    case group

    var id: String { rawValue }

    var title: String {
        switch self {
        case .profile: "Profile"
        case .group: "Group"
        }
    }
}

/// One Settings sheet. The gear opens Profile. The switch on the page chooses Group.
struct SettingsHubView: View {
    @Environment(\.dismiss) private var dismiss
    @State var segment: SettingsHubSegment

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Settings section", selection: $segment) {
                    ForEach(SettingsHubSegment.allCases) { item in
                        Text(item.title).tag(item)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .accessibilityLabel("Settings section")

                Group {
                    if segment == .profile {
                        SettingsView(embedded: true)
                    } else {
                        GroupSettingsView(embedded: true)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(Theme.ceramic)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
