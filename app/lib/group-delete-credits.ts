/** Machine code when a group still has credits and delete was not acknowledged. */
export const CREDIT_FORFEIT_UNACKNOWLEDGED =
	"credit_forfeit_unacknowledged" as const;

export const CREDIT_FORFEIT_ERROR_MESSAGE =
	"This group has remaining credits that will be permanently deleted and are not refunded. Transfer them first, or confirm you accept deleting them.";

export const CREDIT_FORFEIT_ACKNOWLEDGE_LABEL =
	"I understand these credits will be deleted and are not refunded";

export class CreditForfeitUnacknowledgedError extends Error {
	readonly code = CREDIT_FORFEIT_UNACKNOWLEDGED;
	readonly status = 400 as const;
	readonly credits: number;

	constructor(credits: number) {
		super(CREDIT_FORFEIT_ERROR_MESSAGE);
		this.name = "CreditForfeitUnacknowledgedError";
		this.credits = credits;
	}
}

/** Ack is required only when the group still holds a positive credit balance. */
export function creditForfeitAckRequired(
	credits: number,
	acknowledged: boolean,
): boolean {
	return credits > 0 && !acknowledged;
}

export function requiresCreditForfeitAck(credits: number): boolean {
	return credits > 0;
}

export function groupDeleteCreditConsequence(credits: number): string {
	return `${credits} remaining credits (permanently deleted, not refunded)`;
}

export function groupDeleteCreditWarning(
	credits: number,
	canTransfer: boolean,
): string {
	if (canTransfer) {
		return `This group has ${credits} credits. Credits belong to the group and are not refunded. Transfer them to another group first, or they will be permanently deleted with this group.`;
	}
	return `This group has ${credits} credits. They will be permanently deleted and are not refunded.`;
}

export function groupDeleteCreditFooter(credits: number): string {
	return `This group has ${credits} credits. Transfer them in Group settings before deleting, or they will be permanently deleted and not refunded.`;
}

export function parseAcknowledgeCreditForfeit(
	value: FormDataEntryValue | null | undefined,
): boolean {
	if (value == null) return false;
	if (typeof value === "string") {
		return value === "true" || value === "1" || value === "on";
	}
	return false;
}
