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

/// Visual dock order. Raw values stay put so a Cargo tap is not treated as Fuel.
enum DockOrder {
    static func tabs(fuelPageOn: Bool) -> [MainTab] {
        if fuelPageOn {
            return [.cargo, .galley, .hub, .manifest, .supply]
        }
        return [.hub, .cargo, .galley, .manifest, .supply]
    }

    static func tab(at index: Int, fuelPageOn: Bool) -> MainTab? {
        let tabs = tabs(fuelPageOn: fuelPageOn)
        guard tabs.indices.contains(index) else { return nil }
        return tabs[index]
    }

    static func accessibilityIdentifier(_ tab: MainTab, fuelPageOn: Bool) -> String {
        switch tab {
        case .hub:
            return fuelPageOn ? "tab.fuel" : "tab.hub"
        case .cargo:
            return "tab.cargo"
        case .galley:
            return "tab.galley"
        case .manifest:
            return "tab.manifest"
        case .supply:
            return "tab.supply"
        }
    }
}
