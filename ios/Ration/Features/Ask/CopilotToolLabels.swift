import Foundation

enum CopilotToolLabels {
    struct LabelSet {
        let running: String
        let done: String
        let error: String
    }

    private static let fallback = LabelSet(
        running: "Working on it…",
        done: "Done",
        error: "Something went wrong"
    )

    private static let map: [String: LabelSet] = [
        "search_docs": LabelSet(running: "Searching Ration docs…", done: "Searched docs", error: "Doc search failed"),
        "search_ingredients": LabelSet(running: "Searching ingredients…", done: "Searched ingredients", error: "Ingredient search failed"),
        "list_inventory": LabelSet(running: "Checking your Cargo…", done: "Checked Cargo", error: "Cargo lookup failed"),
        "get_cargo_item": LabelSet(running: "Looking up cargo item…", done: "Found cargo item", error: "Cargo lookup failed"),
        "get_expiring_items": LabelSet(running: "Checking expiring items…", done: "Checked expiring items", error: "Expiry check failed"),
        "get_supply_list": LabelSet(running: "Loading your Supply list…", done: "Loaded Supply list", error: "Supply lookup failed"),
        "get_meal_plan": LabelSet(running: "Loading your meal plan…", done: "Loaded meal plan", error: "Meal plan lookup failed"),
        "list_meals": LabelSet(running: "Browsing your Galley…", done: "Browsed Galley", error: "Galley lookup failed"),
        "match_meals": LabelSet(running: "Matching meals to Cargo…", done: "Matched meals", error: "Meal matching failed"),
        "add_cargo_item": LabelSet(running: "Adding to Cargo…", done: "Added to Cargo", error: "Could not add to Cargo"),
        "update_cargo_item": LabelSet(running: "Updating Cargo…", done: "Updated Cargo", error: "Could not update Cargo"),
        "remove_cargo_item": LabelSet(running: "Removing from Cargo…", done: "Removed from Cargo", error: "Could not remove from Cargo"),
        "add_supply_item": LabelSet(running: "Adding to Supply…", done: "Added to Supply", error: "Could not add to Supply"),
        "update_supply_item": LabelSet(running: "Updating Supply…", done: "Updated Supply", error: "Could not update Supply"),
        "remove_supply_item": LabelSet(running: "Removing from Supply…", done: "Removed from Supply", error: "Could not remove from Supply"),
        "mark_supply_purchased": LabelSet(running: "Updating Supply…", done: "Updated Supply", error: "Could not update Supply"),
        "add_meal_plan_entry": LabelSet(running: "Adding to Manifest…", done: "Added to Manifest", error: "Could not update Manifest"),
        "create_meal": LabelSet(running: "Creating meal…", done: "Created meal", error: "Could not create meal"),
        "update_meal": LabelSet(running: "Updating meal…", done: "Updated meal", error: "Could not update meal"),
        "get_context": LabelSet(running: "Loading Ration context…", done: "Loaded context", error: "Context lookup failed"),
    ]

    static func label(for toolName: String, phase: CopilotToolPhase) -> String {
        let set = map[toolName] ?? fallback
        switch phase {
        case .running: return set.running
        case .done: return set.done
        case .error: return set.error
        }
    }
}

enum CopilotToolPhase {
    case running
    case done
    case error
}

enum CopilotAutoExpandPolicy {
    static func canAutoExpand(status: CopilotStatusResponse?) -> Bool {
        guard let status else { return false }
        if status.freeConversationsRemaining > 0 { return true }
        if status.creditBalance < status.conversationFloorCost { return false }
        if status.tier == "crew_member", !status.autoDeductConsent { return false }
        return true
    }

    /// Copilot is fully exhausted — no free chats and insufficient credits for a new conversation.
    /// Crew members without auto-deduct consent are not exhausted; they can open Ask to consent.
    static func isCopilotExhausted(status: CopilotStatusResponse?) -> Bool {
        guard let status else { return false }
        if status.freeConversationsRemaining > 0 { return false }
        if status.creditBalance >= status.conversationFloorCost { return false }
        if status.tier == "crew_member", !status.autoDeductConsent { return false }
        return true
    }
}
