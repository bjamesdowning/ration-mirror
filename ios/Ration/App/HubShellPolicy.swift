import Foundation

/// Dock ownership while Hub covers the Fuel tab. The two menus never share `.hub`.
enum HubShellPolicy {
    static func dockTab(showingHub: Bool, selected: MainTab) -> MainTab {
        showingHub ? .hub : selected
    }

    static func fuelDockActive(showingHub: Bool, selected: MainTab) -> Bool {
        !showingHub && selected == .hub
    }

    static func hubDockActive(showingHub: Bool, editing: Bool, menu: Bool) -> Bool {
        showingHub && !editing && menu
    }
}

/// Capsule symbols between the photo and the gear.
enum PageCapsulePolicy {
    static func symbols(page: String, fuelPageOn: Bool, manifestLoaded: Bool) -> [String] {
        switch page {
        case "fuel":
            return fuelPageOn ? ["chart.bar.fill"] : []
        case "supply":
            return ["list.bullet.rectangle"]
        case "manifest":
            var symbols: [String] = []
            if !fuelPageOn { symbols.append("chart.bar.fill") }
            if manifestLoaded { symbols.append("calendar") }
            return symbols
        default:
            return []
        }
    }
}

/// Where a Hub card goes. Flight Recorder stays on the card.
enum HubWidgetRoute: Equatable {
    case fuel
    case nutritionGoals
    case supply
    case none

    static func fuelTrends(fuelPageOn: Bool) -> HubWidgetRoute {
        fuelPageOn ? .fuel : .nutritionGoals
    }

    static func supplyPreview() -> HubWidgetRoute { .supply }

    static func flightRecorder() -> HubWidgetRoute { .none }
}

/// Device zone sent on a Fuel write. The server remains the authority.
enum FuelDeviceZone {
    static let unusableMessage = "This device's time zone can't be used for Fuel logs."

    static var candidate: String? {
        candidate(from: TimeZone.current.identifier)
    }

    static func candidate(from identifier: String) -> String? {
        if identifier == "UTC" || identifier == "Etc/UTC" { return identifier }
        if identifier.hasPrefix("GMT") { return nil }
        if identifier.contains("/") { return identifier }
        return nil
    }

    static func message(for error: Error) -> String? {
        guard let api = error as? APIError, api.code == "fuel_timezone_required" else {
            return nil
        }
        return unusableMessage
    }
}
