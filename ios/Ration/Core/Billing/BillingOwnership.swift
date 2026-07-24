import Foundation

/// Pure helpers separating personal Crew ownership from household capacity.
enum BillingOwnership {
	/// Personal Crew subscription is active (RevenueCat entitlement and/or account tier).
	static func isPersonalCrewActive(
		entitlementsActive: Bool,
		accountTier: String?,
		fallbackTier: String
	) -> Bool {
		if entitlementsActive { return true }
		return (accountTier ?? fallbackTier) == "crew_member"
	}

	/// Show upgrade marketing when the user does not personally own Crew.
	static func shouldShowCrewMarketing(
		isPersonalCrewActive: Bool,
		creditsTrigger: Bool
	) -> Bool {
		!isPersonalCrewActive || creditsTrigger
	}

	/// Subscription webhook fulfillment: personal Crew must become newly active.
	static func subscriptionFulfillmentVisible(
		latestPersonalActive: Bool,
		baselinePersonalActive: Bool
	) -> Bool {
		latestPersonalActive && !baselinePersonalActive
	}
}

/// Settings Membership copy for personal plan vs household capacity.
enum MembershipDisplay {
	static func tierLabel(isAccountCrewMember: Bool) -> String {
		isAccountCrewMember ? "Crew Member" : "Free"
	}

	static func billingButtonTitle(isAccountCrewMember: Bool) -> String {
		isAccountCrewMember ? "Manage billing" : "Upgrade to Crew Member"
	}

	static func householdCapacityNote(
		organizationIsCrew: Bool,
		isAccountCrewMember: Bool
	) -> String? {
		guard organizationIsCrew, !isAccountCrewMember else { return nil }
		return "This household has Crew capacity."
	}
}
