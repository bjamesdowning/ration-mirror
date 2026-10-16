import AppIntents
import SwiftUI

enum WidgetAppearance: String, AppEnum, Sendable {
    case system
    case light
    case dark

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Appearance")
    }

    static var caseDisplayRepresentations: [WidgetAppearance: DisplayRepresentation] {
        [
            .system: DisplayRepresentation(title: "System"),
            .light: DisplayRepresentation(title: "Light"),
            .dark: DisplayRepresentation(title: "Dark"),
        ]
    }

    func resolved(system: ColorScheme) -> ColorScheme {
        switch self {
        case .system: return system
        case .light: return .light
        case .dark: return .dark
        }
    }
}

struct WidgetAppearanceIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Widget appearance"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Appearance", default: .system)
    var appearance: WidgetAppearance

    func perform() async throws -> some IntentResult {
        .result()
    }
}
