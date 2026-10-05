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
            if url.path.lowercased() == "/eat" {
                return parseCargoEat(url)
            }
            return .cargo
        case "galley":
            let path = url.path.lowercased()
            if path == "/generate" { return .galleyGenerate }
            if path == "/import" {
                let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
                let urlParam = items?.first(where: { $0.name == "url" })?.value
                let decoded = urlParam.flatMap { $0.removingPercentEncoding } ?? urlParam
                let autoRaw = items?.first(where: { $0.name == "auto" })?.value?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                    .lowercased()
                let autoStart = autoRaw == "1" || autoRaw == "true" || autoRaw == "yes"
                return .galleyImport(url: decoded, autoStart: autoStart, userText: nil)
            }
            return nil
        case "manifest":
            let path = url.path.lowercased()
            if path == "/plan-week" { return .manifestPlanWeek }
            if path == "/add" { return parseManifestAdd(url) }
            if path == "/today" { return .manifestToday }
            return nil
        case "supply":
            return composeRequested(url) ? .supplyCompose : .supply
        default:
            return nil
        }
    }

    static func parse(_ string: String) -> AppEnvironment.DeepLinkDestination? {
        guard let url = URL(string: string) else { return nil }
        return parse(url)
    }

    /// `ration://manifest/add?mealId=&date=` — UUID mealId + YYYY-MM-DD date required.
    private static func parseManifestAdd(_ url: URL) -> AppEnvironment.DeepLinkDestination? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let items = components.queryItems
        else { return nil }

        let mealId = items.first(where: { $0.name == "mealId" })?.value
        let date = items.first(where: { $0.name == "date" })?.value
        guard let mealId, let date,
              isUUID(mealId),
              isISODate(date)
        else { return nil }

        return .manifestAddEntry(mealId: mealId, date: date)
    }

    private static func parseCargoEat(_ url: URL) -> AppEnvironment.DeepLinkDestination? {
        guard let id = queryValue(url, name: "id"), isUUID(id) else { return nil }
        return .cargoEat(id: id)
    }

    private static func composeRequested(_ url: URL) -> Bool {
        let raw = queryValue(url, name: "compose")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return raw == "1" || raw == "true" || raw == "yes"
    }

    private static func queryValue(_ url: URL, name: String) -> String? {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == name })?
            .value
    }

    private static func isUUID(_ value: String) -> Bool {
        UUID(uuidString: value) != nil
    }

    private static let isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/

    private static func isISODate(_ value: String) -> Bool {
        guard let match = value.wholeMatch(of: isoDatePattern),
              let year = Int(match.1),
              let month = Int(match.2),
              let day = Int(match.3),
              (1...12).contains(month)
        else { return false }

        var comps = DateComponents()
        comps.year = year
        comps.month = month
        comps.day = day
        comps.calendar = Calendar(identifier: .gregorian)
        return comps.isValidDate
    }
}
