import Foundation

enum SavedListTapAction: Equatable {
    case add
    case menu
}

enum SavedListLogic {
    static func tap(liveState: String?) -> SavedListTapAction {
        switch liveState {
        case "on_live", "in_cart":
            return .menu
        default:
            return .add
        }
    }

    /// A first tap adds with missing_only. A later tap opens the menu and does not send add_all.
    static func copyMode(for action: SavedListTapAction) -> String? {
        switch action {
        case .add:
            return "missing_only"
        case .menu:
            return nil
        }
    }

    static func originLabel(_ createdFrom: String?) -> String {
        switch createdFrom {
        case "live_snapshot", "completed_trip":
            return "From Live"
        case "receipt":
            return "Receipt"
        case "duplicate", "template":
            return "Duplicate"
        default:
            return "Manual"
        }
    }

    static func originSymbol(_ createdFrom: String?) -> String {
        switch createdFrom {
        case "live_snapshot", "completed_trip":
            return "cart"
        case "receipt":
            return "doc.text.viewfinder"
        case "duplicate", "template":
            return "doc.on.doc"
        default:
            return "list.bullet"
        }
    }

    static func statusLine(for item: SupplyItem, now: Date = Date()) -> String {
        var parts: [String] = []
        if let cargo = item.inCargo, cargo > 0 {
            parts.append("In Cargo \(formatQuantity(cargo))")
        }
        if let bought = lastBought(item.lastDockedAt, now: now) {
            parts.append(bought)
        }
        if item.live?.state == "on_live" {
            let quantity = item.live?.quantity ?? item.quantity
            let unit = item.live?.unit ?? item.unit
            parts.append("On Live \(formatQuantity(quantity)) \(unit)")
        }
        if item.live?.state == "in_cart" {
            parts.append("In cart")
        }
        return parts.joined(separator: " · ")
    }

    static func toast(for counts: SupplyAddToLiveCounts, name: String? = nil) -> String {
        if counts.added == 1, counts.merged == 0, let name {
            return "Added \(name) to Live"
        }
        var parts: [String] = []
        if counts.added > 0 { parts.append("Added \(counts.added)") }
        if counts.merged > 0 { parts.append("\(counts.merged) extra") }
        if counts.skippedOnLive > 0 { parts.append("\(counts.skippedOnLive) already on Live") }
        if counts.skippedInCart > 0 { parts.append("\(counts.skippedInCart) in cart") }
        if counts.skippedInCargo > 0 { parts.append("\(counts.skippedInCargo) in Cargo") }
        return parts.isEmpty ? "Nothing new to add" : parts.joined(separator: " · ")
    }

    static func receiptListName(date: Date = Date(), storeName: String? = nil) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_GB")
        formatter.dateFormat = "d MMM yyyy"
        let base = "Receipt · \(formatter.string(from: date))"
        let store = storeName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return store.isEmpty ? base : "\(base) · \(store)"
    }

    private static func formatQuantity(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(value)
    }

    private static func lastBought(_ iso: String?, now: Date) -> String? {
        guard let iso, let at = ISO8601DateFormatter().date(from: iso) else { return nil }
        let days = Int(now.timeIntervalSince(at) / 86_400)
        if days <= 0 { return "Last bought today" }
        if days == 1 { return "Last bought yesterday" }
        if days < 7 { return "Last bought \(days) d ago" }
        if days < 30 { return "Last bought \(max(1, Int((Double(days) / 7).rounded()))) wk ago" }
        return "Last bought \(max(1, Int((Double(days) / 30).rounded()))) mo ago"
    }
}
