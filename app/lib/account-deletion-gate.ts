import type { TierSlug } from "~/lib/tiers";

export type AccountDeletionBlockReason = "active_subscription";

export type AccountDeletionEligibility = {
	canDelete: boolean;
	blockReason: AccountDeletionBlockReason | null;
	/** True when Crew is still active but set to end (cancel-at-period-end). */
	cancelAtPeriodEnd: boolean;
	tierExpiresAt: string | null;
	effectiveTier: TierSlug;
	/** User-facing explanation for the current gate state. */
	message: string;
};

function toExpiryDate(
	value: Date | number | string | null | undefined,
): Date | null {
	if (value == null) return null;
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}
	if (typeof value === "number") {
		const ms = value < 1e12 ? value * 1000 : value;
		const date = new Date(ms);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(
	value: Date | number | string | null | undefined,
): string | null {
	const date = toExpiryDate(value);
	return date ? date.toISOString() : null;
}

function effectiveTier(
	tier: string,
	tierExpiresAt: Date | number | string | null | undefined,
	now: Date,
): TierSlug {
	const raw: TierSlug = tier === "crew_member" ? "crew_member" : "free";
	const expiresAt = toExpiryDate(tierExpiresAt);
	if (
		raw === "crew_member" &&
		expiresAt &&
		expiresAt.getTime() <= now.getTime()
	) {
		return "free";
	}
	return raw;
}

/**
 * Pure gate for account deletion.
 * Blocks only while effective Crew is active AND not already cancel-at-period-end.
 */
export function evaluateAccountDeletionEligibility(input: {
	tier: string;
	tierExpiresAt?: Date | number | string | null;
	subscriptionCancelAtPeriodEnd?: boolean | null;
	now?: Date;
}): AccountDeletionEligibility {
	const now = input.now ?? new Date();
	const tier = effectiveTier(input.tier, input.tierExpiresAt, now);
	const cancelAtPeriodEnd = Boolean(input.subscriptionCancelAtPeriodEnd);
	const tierExpiresAt = toIso(input.tierExpiresAt);

	if (tier === "crew_member" && !cancelAtPeriodEnd) {
		return {
			canDelete: false,
			blockReason: "active_subscription",
			cancelAtPeriodEnd: false,
			tierExpiresAt,
			effectiveTier: tier,
			message:
				"Cancel your Crew subscription first. Once it is set to end, you can delete your account.",
		};
	}

	if (tier === "crew_member" && cancelAtPeriodEnd) {
		const endsLabel = tierExpiresAt
			? new Date(tierExpiresAt).toLocaleDateString(undefined, {
					year: "numeric",
					month: "short",
					day: "numeric",
				})
			: "the end of your billing period";
		return {
			canDelete: true,
			blockReason: null,
			cancelAtPeriodEnd: true,
			tierExpiresAt,
			effectiveTier: tier,
			message: `Your subscription is cancelled and ends on ${endsLabel}. You can wait until then, or delete now and lose access to all services immediately (no refund for unused time).`,
		};
	}

	return {
		canDelete: true,
		blockReason: null,
		cancelAtPeriodEnd: false,
		tierExpiresAt,
		effectiveTier: tier,
		message:
			"Deleting your account permanently removes your data and signs you out immediately.",
	};
}
