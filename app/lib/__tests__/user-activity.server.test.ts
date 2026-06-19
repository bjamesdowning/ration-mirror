import { describe, expect, it } from "vitest";
import {
	ACTIVITY_TOUCH_THROTTLE_MS,
	computeLastActiveAtMs,
	getReengagementCutoffUnix,
	INACTIVITY_DAYS,
	isEligibleForReengagementEmail,
	REENGAGEMENT_EMAIL_COOLDOWN_DAYS,
	shouldTouchLastActive,
	timestampToMs,
} from "~/lib/user-activity.server";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW_MS = Date.UTC(2026, 5, 19, 12, 0, 0);

describe("user-activity.server", () => {
	describe("computeLastActiveAtMs", () => {
		it("returns the most recent activity timestamp across signals", () => {
			const result = computeLastActiveAtMs({
				sessionUpdatedAtMs: 1_000,
				apiKeyLastUsedAtMs: 5_000,
				settingsLastActiveAtMs: 3_000,
			});

			expect(result).toBe(5_000);
		});

		it("returns 0 when all signals are absent", () => {
			expect(
				computeLastActiveAtMs({
					sessionUpdatedAtMs: 0,
					apiKeyLastUsedAtMs: 0,
					settingsLastActiveAtMs: 0,
				}),
			).toBe(0);
		});
	});

	describe("timestampToMs", () => {
		it("converts unix seconds to milliseconds", () => {
			expect(timestampToMs(1_700_000_000)).toBe(1_700_000_000_000);
		});

		it("passes through millisecond timestamps", () => {
			expect(timestampToMs(1_700_000_000_000)).toBe(1_700_000_000_000);
		});

		it("converts Date values", () => {
			const date = new Date("2026-06-19T12:00:00.000Z");
			expect(timestampToMs(date)).toBe(date.getTime());
		});
	});

	describe("getReengagementCutoffUnix", () => {
		it("returns 30-day inactivity and cooldown cutoffs in unix seconds", () => {
			const { inactiveCutoffUnix, emailCooldownCutoffUnix } =
				getReengagementCutoffUnix(NOW_MS);

			expect(inactiveCutoffUnix).toBe(
				Math.floor((NOW_MS - INACTIVITY_DAYS * MS_PER_DAY) / 1000),
			);
			expect(emailCooldownCutoffUnix).toBe(
				Math.floor(
					(NOW_MS - REENGAGEMENT_EMAIL_COOLDOWN_DAYS * MS_PER_DAY) / 1000,
				),
			);
		});
	});

	describe("shouldTouchLastActive", () => {
		const now = new Date("2026-06-19T12:00:00.000Z");

		it("returns true when lastActiveAt is missing", () => {
			expect(shouldTouchLastActive(undefined, now)).toBe(true);
		});

		it("returns false inside the throttle window", () => {
			const recent = new Date(
				now.getTime() - ACTIVITY_TOUCH_THROTTLE_MS + 60_000,
			).toISOString();
			expect(shouldTouchLastActive(recent, now)).toBe(false);
		});

		it("returns true once the throttle window has elapsed", () => {
			const stale = new Date(
				now.getTime() - ACTIVITY_TOUCH_THROTTLE_MS - 1,
			).toISOString();
			expect(shouldTouchLastActive(stale, now)).toBe(true);
		});
	});

	describe("isEligibleForReengagementEmail", () => {
		const inactivityMs = INACTIVITY_DAYS * MS_PER_DAY;
		const cooldownMs = REENGAGEMENT_EMAIL_COOLDOWN_DAYS * MS_PER_DAY;

		it("is eligible when inactive beyond threshold and account is old enough", () => {
			const eligible = isEligibleForReengagementEmail({
				lastActiveAtMs: NOW_MS - inactivityMs - MS_PER_DAY,
				userCreatedAtMs: NOW_MS - inactivityMs - MS_PER_DAY * 2,
				nowMs: NOW_MS,
			});

			expect(eligible).toBe(true);
		});

		it("is not eligible when last activity is within the inactivity window", () => {
			const eligible = isEligibleForReengagementEmail({
				lastActiveAtMs: NOW_MS - inactivityMs + MS_PER_DAY,
				userCreatedAtMs: NOW_MS - inactivityMs - MS_PER_DAY * 2,
				nowMs: NOW_MS,
			});

			expect(eligible).toBe(false);
		});

		it("is not eligible when the account is newer than the inactivity window", () => {
			const eligible = isEligibleForReengagementEmail({
				lastActiveAtMs: 0,
				userCreatedAtMs: NOW_MS - MS_PER_DAY * 5,
				nowMs: NOW_MS,
			});

			expect(eligible).toBe(false);
		});

		it("is not eligible when a re-engagement email was sent within the cooldown", () => {
			const eligible = isEligibleForReengagementEmail({
				lastActiveAtMs: NOW_MS - inactivityMs - MS_PER_DAY,
				userCreatedAtMs: NOW_MS - inactivityMs - MS_PER_DAY * 2,
				reengagementEmailSentAt: new Date(
					NOW_MS - cooldownMs + MS_PER_DAY,
				).toISOString(),
				nowMs: NOW_MS,
			});

			expect(eligible).toBe(false);
		});

		it("is eligible when the last re-engagement email is outside the cooldown", () => {
			const eligible = isEligibleForReengagementEmail({
				lastActiveAtMs: NOW_MS - inactivityMs - MS_PER_DAY,
				userCreatedAtMs: NOW_MS - inactivityMs - MS_PER_DAY * 2,
				reengagementEmailSentAt: new Date(
					NOW_MS - cooldownMs - MS_PER_DAY,
				).toISOString(),
				nowMs: NOW_MS,
			});

			expect(eligible).toBe(true);
		});
	});
});
