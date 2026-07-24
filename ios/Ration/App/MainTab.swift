import Foundation

/// Primary shell tabs — raw values match historical TabView tags.
enum MainTab: Int, CaseIterable, Hashable, Identifiable, Sendable {
    case hub = 0
    case cargo = 1
    case galley = 2
    case manifest = 3
    case supply = 4

    var id: Int { rawValue }
}
