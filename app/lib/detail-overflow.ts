const LEADING_OVERFLOW_LABELS = ["Delete", "Edit"] as const;

/**
 * Shared detail actions sit first: Delete, then Edit.
 * Every other action keeps its current relative order after those two.
 */
export function orderOverflowActions<T extends { label: string }>(
	actions: readonly T[],
): T[] {
	return actions
		.map((action, index) => {
			const lead = LEADING_OVERFLOW_LABELS.indexOf(
				action.label as (typeof LEADING_OVERFLOW_LABELS)[number],
			);
			return {
				action,
				index,
				lead: lead === -1 ? LEADING_OVERFLOW_LABELS.length : lead,
			};
		})
		.sort((a, b) => a.lead - b.lead || a.index - b.index)
		.map((row) => row.action);
}
