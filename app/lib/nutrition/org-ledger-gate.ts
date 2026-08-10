/**
 * Pure org-ledger decision gate for food-name resolve.
 * Keeps fail-closed miss semantics without poisoning on legacy abstention rows.
 */
import type { NutritionMatchQuality } from "./types";

export type OrgLedgerGateDecision = {
	resolutionKind: string | null;
	fdcId: number | null;
	decisionSource: string | null;
	matchQuality: NutritionMatchQuality | null;
};

/**
 * Classify how an org ledger row should affect resolve.
 * - miss: hard miss (return null)
 * - attach: hydrate fdcId and return
 * - abstain: strict auto-accept path declines medium
 * - ignore: fall through to FTS (includes poisoned review+null rows)
 */
export function classifyOrgLedgerDecision(
	decision: OrgLedgerGateDecision,
	requireAutoAccept: boolean,
): "miss" | "attach" | "abstain" | "ignore" {
	if (decision.resolutionKind === "miss") return "miss";

	// Legacy matcher wrote review + null fdcId with hit TTL — never treat as miss.
	if (decision.fdcId == null) return "ignore";

	const isTrustedSource =
		decision.decisionSource === "user" || decision.decisionSource === "barcode";
	const isHigh =
		decision.matchQuality === "verified" || decision.matchQuality === "high";
	const isMediumAttachable =
		!requireAutoAccept && decision.matchQuality === "medium";

	if (isTrustedSource || isHigh || isMediumAttachable) return "attach";
	if (requireAutoAccept) return "abstain";
	return "ignore";
}
