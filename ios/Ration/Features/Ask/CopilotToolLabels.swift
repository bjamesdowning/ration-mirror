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
        "get_expired_items": LabelSet(running: "Checking expired items…", done: "Checked expired items", error: "Expired check failed"),
        "get_kitchen_summary": LabelSet(running: "Summarizing your kitchen…", done: "Kitchen summary ready", error: "Kitchen summary failed"),
        "get_kitchen_events": LabelSet(running: "Reading Flight Recorder…", done: "Loaded kitchen activity", error: "Could not load kitchen activity"),
        "get_kitchen_stats": LabelSet(running: "Computing kitchen stats…", done: "Kitchen stats ready", error: "Could not load kitchen stats"),
        "get_supply_list": LabelSet(running: "Loading your Supply list…", done: "Loaded Supply list", error: "Supply lookup failed"),
        "get_meal_plan": LabelSet(running: "Loading your meal plan…", done: "Loaded meal plan", error: "Meal plan lookup failed"),
        "list_meals": LabelSet(running: "Browsing your Galley…", done: "Browsed Galley", error: "Galley lookup failed"),
        "match_meals": LabelSet(running: "Matching meals to Cargo…", done: "Matched meals", error: "Meal matching failed"),
        "add_cargo_item": LabelSet(running: "Adding to Cargo…", done: "Added to Cargo", error: "Could not add to Cargo"),
        "update_cargo_item": LabelSet(running: "Updating Cargo…", done: "Updated Cargo", error: "Could not update Cargo"),
        "adjust_cargo_item": LabelSet(running: "Adjusting Cargo…", done: "Adjusted Cargo", error: "Could not adjust Cargo"),
        "remove_cargo_item": LabelSet(running: "Removing from Cargo…", done: "Removed from Cargo", error: "Could not remove from Cargo"),
        "preview_inventory_remove": LabelSet(running: "Previewing Cargo removals…", done: "Previewed Cargo removals", error: "Could not preview Cargo removals"),
        "apply_inventory_remove": LabelSet(running: "Removing Cargo items…", done: "Removed Cargo items", error: "Could not remove Cargo items"),
        "preview_inventory_import": LabelSet(running: "Previewing Cargo import…", done: "Previewed Cargo import", error: "Could not preview Cargo import"),
        "apply_inventory_import": LabelSet(running: "Importing into Cargo…", done: "Imported into Cargo", error: "Could not import into Cargo"),
        "import_inventory_csv": LabelSet(running: "Importing Cargo CSV…", done: "Imported Cargo CSV", error: "Could not import Cargo CSV"),
        "add_supply_item": LabelSet(running: "Adding to Supply…", done: "Added to Supply", error: "Could not add to Supply"),
        "update_supply_item": LabelSet(running: "Updating Supply…", done: "Updated Supply", error: "Could not update Supply"),
        "remove_supply_item": LabelSet(running: "Removing from Supply…", done: "Removed from Supply", error: "Could not remove from Supply"),
        "sync_supply_from_selected_meals": LabelSet(running: "Syncing Supply from meals…", done: "Synced Supply from meals", error: "Could not sync Supply"),
        "complete_supply_list": LabelSet(running: "Docking purchased supplies…", done: "Docked purchased supplies", error: "Could not complete Supply list"),
        "add_meal_plan_entry": LabelSet(running: "Adding to Manifest…", done: "Added to Manifest", error: "Could not update Manifest"),
        "update_meal_plan_entry": LabelSet(running: "Updating Manifest…", done: "Updated Manifest", error: "Could not update Manifest"),
        "consume_manifest_entries": LabelSet(running: "Logging Manifest meals…", done: "Logged Manifest meals", error: "Could not log Manifest meals"),
        "cook_manifest_entries": LabelSet(running: "Cooking Manifest meals…", done: "Cooked Manifest meals", error: "Could not cook Manifest meals"),
        "log_manifest_intake": LabelSet(running: "Logging personal intake…", done: "Logged personal intake", error: "Could not log personal intake"),
        "clear_manifest_intake": LabelSet(running: "Clearing personal intake…", done: "Cleared personal intake", error: "Could not clear personal intake"),
        "list_nutrition_intakes": LabelSet(running: "Loading intake history…", done: "Loaded intake history", error: "Could not load intake history"),
        "remove_meal_plan_entry": LabelSet(running: "Removing from Manifest…", done: "Removed from Manifest", error: "Could not update Manifest"),
        "create_meal": LabelSet(running: "Creating meal…", done: "Created meal", error: "Could not create meal"),
        "update_meal": LabelSet(running: "Updating meal…", done: "Updated meal", error: "Could not update meal"),
        "delete_meal": LabelSet(running: "Deleting meal…", done: "Deleted meal", error: "Could not delete meal"),
        "clear_active_meals": LabelSet(running: "Clearing Galley selections…", done: "Cleared Galley selections", error: "Could not clear Galley selections"),
        "consume_meal": LabelSet(running: "Logging meal and updating Cargo…", done: "Logged meal and updated Cargo", error: "Could not log meal"),
        "set_active_meals": LabelSet(running: "Updating Galley selections…", done: "Updated Galley selections", error: "Could not update Galley selections"),
        "propose_manifest_plan": LabelSet(running: "Proposing a meal plan…", done: "Proposed a meal plan", error: "Could not propose a meal plan"),
        "commit_manifest_plan": LabelSet(running: "Saving meal plan…", done: "Saved meal plan", error: "Could not save meal plan"),
        "mark_supply_purchased_bulk": LabelSet(running: "Updating Supply purchases…", done: "Updated Supply purchases", error: "Could not update Supply purchases"),
        "quick_eat_cargo": LabelSet(running: "Logging a Quick Eat…", done: "Logged Quick Eat", error: "Could not log Quick Eat"),
        "get_context": LabelSet(running: "Loading Ration context…", done: "Loaded context", error: "Context lookup failed"),
        "get_billing_summary": LabelSet(running: "Loading billing summary…", done: "Loaded billing summary", error: "Billing lookup failed"),
        "get_user_preferences": LabelSet(running: "Loading preferences…", done: "Loaded preferences", error: "Could not load preferences"),
        "update_user_preferences": LabelSet(running: "Updating preferences…", done: "Updated preferences", error: "Could not update preferences"),
        "get_nutrition_summary": LabelSet(running: "Loading nutrition summary…", done: "Loaded nutrition summary", error: "Could not load nutrition summary"),
        "set_nutrition_goal": LabelSet(running: "Saving nutrition goal…", done: "Saved nutrition goal", error: "Could not save nutrition goal"),
        "clear_nutrition_goal": LabelSet(running: "Clearing nutrition goal…", done: "Cleared nutrition goal", error: "Could not clear nutrition goal"),
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
    /// Consent only matters when credits exist to deduct (`canAutoExpand`); without credits the user needs the paywall.
    static func isCopilotExhausted(status: CopilotStatusResponse?) -> Bool {
        guard let status else { return false }
        if status.freeConversationsRemaining > 0 { return false }
        if status.creditBalance >= status.conversationFloorCost { return false }
        return true
    }
}
