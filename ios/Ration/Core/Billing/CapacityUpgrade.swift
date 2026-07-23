import Foundation

/// Why the paywall is being shown — drives layout emphasis (Crew vs credits).
enum PaywallTrigger: String, Sendable, Equatable {
    case capacity
    case featureGate
    case credits
    case settings
}

/// Contextual payload for `PaywallView` — resource counts + trigger.
/// `id` is presentation-scoped (new UUID per open) so `.sheet(item:)` re-presents reliably.
struct PaywallContext: Equatable, Sendable, Identifiable {
    let id: UUID
    let trigger: PaywallTrigger
    let resource: String?
    let current: Int?
    let limit: Int?

    init(
        trigger: PaywallTrigger,
        resource: String? = nil,
        current: Int? = nil,
        limit: Int? = nil,
        id: UUID = UUID()
    ) {
        self.id = id
        self.trigger = trigger
        self.resource = resource
        self.current = current
        self.limit = limit
    }

    static func settings() -> PaywallContext {
        PaywallContext(trigger: .settings)
    }

    static func credits() -> PaywallContext {
        PaywallContext(trigger: .credits)
    }

    /// Prefer subscription packages first for capacity / feature gates.
    var prefersCrewFirst: Bool {
        switch trigger {
        case .capacity, .featureGate, .settings:
            true
        case .credits:
            false
        }
    }

    var reasonTitle: String? {
        switch trigger {
        case .capacity:
            guard let label = CapacityUpgrade.resourceLabel(resource) else {
                return "Capacity limit reached"
            }
            if let current, let limit, limit > 0 {
                return "\(label) capacity reached — \(current)/\(limit)"
            }
            if let limit, limit > 0 {
                return "\(label) capacity reached — limit \(limit)"
            }
            return "\(label) capacity reached"
        case .featureGate:
            return CapacityUpgrade.featureGateTitle(resource)
        case .credits:
            return "Add credits for AI features"
        case .settings:
            return nil
        }
    }

    var reasonDetail: String? {
        switch trigger {
        case .capacity:
            return "Upgrade to Crew Member for unlimited Cargo, Meals, and Supply lists."
        case .featureGate:
            return CapacityUpgrade.featureGateDetail(resource)
        case .credits:
            return "Credits power scans, meal generation, and Ask Ration. They work on Free and Crew."
        case .settings:
            return nil
        }
    }

    var headline: String {
        switch trigger {
        case .capacity:
            return "Keep building your pantry"
        case .featureGate:
            return "Unlock household logistics"
        case .credits:
            return "Power AI with credits"
        case .settings:
            return "Unlock unlimited Cargo & Galley"
        }
    }
}

/// Maps capacity / feature-gate API errors (and batch error strings) to paywall context.
enum CapacityUpgrade {
    /// Returns a paywall context when the user should upgrade; `nil` when the error
    /// is not an upgrade gate (or the user already at Crew owned-group hard cap).
    ///
    /// - Parameter isCrewMember: Group-owner Crew status from session. Used only for
    ///   org-scoped resources (cargo/meals). **Owned groups use the API `tier` / limit**
    ///   because that capacity is user-tier, not group-owner tier.
    /// - Parameter defaultResource: Fallback when the API omits `resource` (common for
    ///   bare `feature_gated` responses).
    static func context(
        from error: APIError,
        isCrewMember: Bool = false,
        defaultResource: String? = nil
    ) -> PaywallContext? {
        if error.isFeatureGated {
            return PaywallContext(
                trigger: .featureGate,
                resource: error.serverResource ?? defaultResource,
                current: error.serverCurrent,
                limit: error.serverLimit
            )
        }
        guard error.isCapacityExceeded else { return nil }

        let parsed = parseCapacityPrefix(error.serverErrorCode ?? "")
        let resource = error.serverResource ?? parsed.resource ?? defaultResource
        let limit = error.serverLimit ?? parsed.limit
        let current = error.serverCurrent ?? parsed.current

        // Owned-group caps are **user-tier** (not session/group owner tier).
        if resource == "owned_groups", isUserAtCrewOwnedGroupCap(tier: error.serverTier, limit: limit) {
            return nil
        }

        // Org-scoped unlimited resources: Crew households should not hit capacity
        // for cargo/meals; owned_groups is handled above via user tier.
        _ = isCrewMember

        return PaywallContext(
            trigger: .capacity,
            resource: resource,
            current: current,
            limit: limit
        )
    }

    /// Batch cargo returns per-item errors in a 200 body: `capacity_exceeded` or `capacity_exceeded:35`.
    static func context(fromBatchErrors errors: [BatchCargoError]?) -> PaywallContext? {
        guard let errors else { return nil }
        for entry in errors {
            if let parsed = parseCapacityErrorString(entry.error) {
                return PaywallContext(
                    trigger: .capacity,
                    resource: parsed.resource ?? "cargo",
                    current: parsed.current,
                    limit: parsed.limit
                )
            }
        }
        return nil
    }

    static func parseCapacityErrorString(
        _ raw: String
    ) -> (resource: String?, current: Int?, limit: Int?)? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed == "capacity_exceeded" || trimmed.hasPrefix("capacity_exceeded:") else {
            return nil
        }
        return parseCapacityPrefix(trimmed)
    }

    /// True when the **user** (not group) is already on Crew owned-group limit.
    /// Prefer API `tier`; if missing, treat limit ≥ crew max as Crew hard-cap.
    static func isUserAtCrewOwnedGroupCap(tier: String?, limit: Int?) -> Bool {
        if tier == "crew_member" { return true }
        if tier == "free" { return false }
        if let limit, limit >= TierLimits.crewMaxOwnedGroups { return true }
        return false
    }

    static func resourceLabel(_ resource: String?) -> String? {
        switch resource {
        case "cargo", "inventory":
            return "Cargo"
        case "meals":
            return "Meals"
        case "grocery_lists", "supply_lists", "supplyLists", "supply":
            return "Supply lists"
        case "owned_groups":
            return "Groups"
        case nil:
            return nil
        default:
            return resource?.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    static func featureGateTitle(_ resource: String?) -> String {
        switch resource {
        case "invites", "invite_members":
            return "Member invites are a Crew feature"
        case "share", "share_grocery_lists", "share_manifest":
            return "Sharing is a Crew feature"
        default:
            return "This feature requires Crew Member"
        }
    }

    static func featureGateDetail(_ resource: String?) -> String {
        switch resource {
        case "invites", "invite_members":
            return "Invite household members and share Cargo, Galley, and Supply in one group."
        case "share", "share_grocery_lists", "share_manifest":
            return "Share Manifest and Supply lists via public links with Crew Member."
        default:
            return "Upgrade to Crew Member to unlock groups, invites, and share links."
        }
    }

    // MARK: - Private

    private static func parseCapacityPrefix(
        _ raw: String
    ) -> (resource: String?, current: Int?, limit: Int?) {
        // Forms:
        // - capacity_exceeded
        // - capacity_exceeded:35
        // - capacity_exceeded:meals:15
        // - capacity_exceeded:meals:15:15 (resource:current:limit)
        let parts = raw.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
        guard parts.first == "capacity_exceeded" else {
            return (nil, nil, nil)
        }
        if parts.count == 1 {
            return (nil, nil, nil)
        }
        if parts.count == 2, let limit = Int(parts[1]) {
            return (nil, nil, limit)
        }
        if parts.count >= 4, let current = Int(parts[2]), let limit = Int(parts[3]) {
            return (parts[1], current, limit)
        }
        if parts.count >= 3, let limit = Int(parts[2]) {
            return (parts[1], nil, limit)
        }
        if parts.count >= 2 {
            return (parts[1], nil, nil)
        }
        return (nil, nil, nil)
    }
}
