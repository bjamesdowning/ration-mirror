import Foundation

/// Allowlisted in-app deep links for the `ration://` custom scheme.
enum AppDeepLink {
    static func parse(_ url: URL) -> AppEnvironment.DeepLinkDestination? {
        guard url.scheme?.lowercased() == AppConfig.authCallbackScheme else { return nil }
        switch url.host?.lowercased() {
        case "ask":
            return .ask
        case "scan":
            return .scan
        case "cargo":
            return .cargo
        case "galley":
            let path = url.path.lowercased()
            if path == "/generate" { return .galleyGenerate }
            if path == "/import" { return .galleyImport }
            return nil
        case "manifest":
            if url.path.lowercased() == "/plan-week" { return .manifestPlanWeek }
            return nil
        default:
            return nil
        }
    }

    static func parse(_ string: String) -> AppEnvironment.DeepLinkDestination? {
        guard let url = URL(string: string) else { return nil }
        return parse(url)
    }
}
