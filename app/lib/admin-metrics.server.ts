import { and, count, eq, gt, isNull, like, lt, or, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { userLastActiveUnixSql } from "./user-activity.server";

export interface DauWauMauResult {
	dau: number;
	wau: number;
	mau: number;
	stickiness: number;
}

export interface ActivationRateResult {
	rate: number;
	activatedCount: number;
	totalUsers: number;
}

export interface CrewHealthResult {
	activeCrew: number;
	expiringSoon: number;
	cancelPending: number;
}

export interface OrgEngagementMedians {
	medianCargo: number;
	medianMeals: number;
	medianScans: number;
}

export interface PlatformSplitResult {
	activeWebSessions: number;
	activeMobileTokens: number;
	distinctWebUsers: number;
	distinctMobileUsers: number;
}

export interface AiBurnRow {
	feature: string;
	credits24h: number;
	credits7d: number;
	calls24h: number;
}

/** Compute median of a numeric array (includes zeros). */
export function computeMedian(numbers: number[]): number {
	if (numbers.length === 0) return 0;
	const sorted = [...numbers].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return (sorted[mid - 1] + sorted[mid]) / 2;
	}
	return sorted[mid];
}

/** Strip idempotency suffix from ledger reason strings. */
export function normalizeLedgerReason(reason: string): string {
	return reason.split(":")[0];
}

export function computeActivationRate(
	activatedCount: number,
	totalUsers: number,
): number {
	if (totalUsers === 0) return 0;
	return (activatedCount / totalUsers) * 100;
}

export function computeStickiness(dau: number, mau: number): number {
	if (mau === 0) return 0;
	return (dau / mau) * 100;
}

/** Merge 24h and 7d ledger burn rows into a unified breakdown (top N by 7d burn). */
export function mergeAiBurnRows(
	rows24h: { reason: string; credits: number; calls: number }[],
	rows7d: { reason: string; credits: number; calls: number }[],
	topN = 8,
): AiBurnRow[] {
	const map24h = new Map<string, { credits: number; calls: number }>();
	for (const row of rows24h) {
		const feature = normalizeLedgerReason(row.reason);
		const existing = map24h.get(feature) ?? { credits: 0, calls: 0 };
		map24h.set(feature, {
			credits: existing.credits + row.credits,
			calls: existing.calls + row.calls,
		});
	}

	const map7d = new Map<string, number>();
	for (const row of rows7d) {
		const feature = normalizeLedgerReason(row.reason);
		map7d.set(feature, (map7d.get(feature) ?? 0) + row.credits);
	}

	const features = new Set([...map24h.keys(), ...map7d.keys()]);
	return Array.from(features)
		.map((feature) => ({
			feature,
			credits24h: map24h.get(feature)?.credits ?? 0,
			credits7d: map7d.get(feature) ?? 0,
			calls24h: map24h.get(feature)?.calls ?? 0,
		}))
		.sort((a, b) => b.credits7d - a.credits7d)
		.slice(0, topN);
}

async function countActiveUsersSince(
	db: DrizzleD1Database<typeof schema>,
	cutoffUnix: number,
): Promise<number> {
	const result = await db
		.select({ count: count() })
		.from(schema.user)
		.where(sql`${userLastActiveUnixSql()} >= ${cutoffUnix}`)
		.get();
	return result?.count ?? 0;
}

export async function getDauWauMau(
	db: DrizzleD1Database<typeof schema>,
	now: Date,
): Promise<DauWauMauResult> {
	const nowUnix = Math.floor(now.getTime() / 1000);
	const oneDayCutoff = nowUnix - 24 * 60 * 60;
	const sevenDayCutoff = nowUnix - 7 * 24 * 60 * 60;
	const thirtyDayCutoff = nowUnix - 30 * 24 * 60 * 60;

	const [dau, wau, mau] = await Promise.all([
		countActiveUsersSince(db, oneDayCutoff),
		countActiveUsersSince(db, sevenDayCutoff),
		countActiveUsersSince(db, thirtyDayCutoff),
	]);

	return {
		dau,
		wau,
		mau,
		stickiness: computeStickiness(dau, mau),
	};
}

export async function getActivationRate(
	db: DrizzleD1Database<typeof schema>,
): Promise<ActivationRateResult> {
	const result = await db
		.select({
			totalUsers: sql<number>`count(distinct ${schema.user.id})`,
			activatedCount: sql<number>`count(distinct case when ${schema.cargo.id} is not null then ${schema.user.id} end)`,
		})
		.from(schema.user)
		.leftJoin(schema.member, eq(schema.member.userId, schema.user.id))
		.leftJoin(
			schema.cargo,
			and(
				eq(schema.cargo.organizationId, schema.member.organizationId),
				sql`${schema.cargo.createdAt} >= ${schema.user.createdAt}`,
				sql`${schema.cargo.createdAt} <= datetime(${schema.user.createdAt}, '+7 days')`,
			),
		)
		.get();

	const totalUsers = result?.totalUsers ?? 0;
	const activatedCount = result?.activatedCount ?? 0;

	return {
		rate: computeActivationRate(activatedCount, totalUsers),
		activatedCount,
		totalUsers,
	};
}

export async function getCrewHealth(
	db: DrizzleD1Database<typeof schema>,
	now: Date,
	sevenDaysFromNow: Date,
): Promise<CrewHealthResult> {
	const [activeResult, expiringResult, cancelResult] = await Promise.all([
		db
			.select({ count: count() })
			.from(schema.user)
			.where(
				and(
					eq(schema.user.tier, "crew_member"),
					or(
						isNull(schema.user.tierExpiresAt),
						gt(schema.user.tierExpiresAt, now),
					),
				),
			)
			.get(),
		db
			.select({ count: count() })
			.from(schema.user)
			.where(
				and(
					eq(schema.user.tier, "crew_member"),
					gt(schema.user.tierExpiresAt, now),
					lt(schema.user.tierExpiresAt, sevenDaysFromNow),
				),
			)
			.get(),
		db
			.select({ count: count() })
			.from(schema.user)
			.where(
				and(
					eq(schema.user.tier, "crew_member"),
					eq(schema.user.subscriptionCancelAtPeriodEnd, true),
				),
			)
			.get(),
	]);

	return {
		activeCrew: activeResult?.count ?? 0,
		expiringSoon: expiringResult?.count ?? 0,
		cancelPending: cancelResult?.count ?? 0,
	};
}

export async function getOrgEngagementMedians(
	db: DrizzleD1Database<typeof schema>,
): Promise<OrgEngagementMedians> {
	const [allOrgs, cargoCounts, mealCounts, scanCounts] = await Promise.all([
		db.select({ id: schema.organization.id }).from(schema.organization),
		db
			.select({
				organizationId: schema.cargo.organizationId,
				itemCount: count(),
			})
			.from(schema.cargo)
			.groupBy(schema.cargo.organizationId),
		db
			.select({
				organizationId: schema.meal.organizationId,
				mealCount: count(),
			})
			.from(schema.meal)
			.groupBy(schema.meal.organizationId),
		db
			.select({
				organizationId: schema.ledger.organizationId,
				scanCount: count(),
			})
			.from(schema.ledger)
			.where(
				and(
					lt(schema.ledger.amount, 0),
					or(
						like(schema.ledger.reason, "%scan%"),
						like(schema.ledger.reason, "%Scan%"),
					),
				),
			)
			.groupBy(schema.ledger.organizationId),
	]);

	const cargoMap = new Map(
		cargoCounts.map((r) => [r.organizationId, r.itemCount]),
	);
	const mealMap = new Map(
		mealCounts.map((r) => [r.organizationId, r.mealCount]),
	);
	const scanMap = new Map(
		scanCounts.map((r) => [r.organizationId, r.scanCount]),
	);

	const cargoValues = allOrgs.map((o) => cargoMap.get(o.id) ?? 0);
	const mealValues = allOrgs.map((o) => mealMap.get(o.id) ?? 0);
	const scanValues = allOrgs.map((o) => scanMap.get(o.id) ?? 0);

	return {
		medianCargo: computeMedian(cargoValues),
		medianMeals: computeMedian(mealValues),
		medianScans: computeMedian(scanValues),
	};
}

export async function getPlatformSplit(
	db: DrizzleD1Database<typeof schema>,
	now: Date,
): Promise<PlatformSplitResult> {
	const [webSessions, mobileTokens, webUsers, mobileUsers] = await Promise.all([
		db
			.select({ count: count() })
			.from(schema.session)
			.where(gt(schema.session.expiresAt, now))
			.get(),
		db
			.select({ count: count() })
			.from(schema.mobileRefreshToken)
			.where(
				and(
					isNull(schema.mobileRefreshToken.revokedAt),
					gt(schema.mobileRefreshToken.expiresAt, now),
				),
			)
			.get(),
		db
			.select({
				count: sql<number>`count(distinct ${schema.session.userId})`,
			})
			.from(schema.session)
			.where(gt(schema.session.expiresAt, now))
			.get(),
		db
			.select({
				count: sql<number>`count(distinct ${schema.mobileRefreshToken.userId})`,
			})
			.from(schema.mobileRefreshToken)
			.where(
				and(
					isNull(schema.mobileRefreshToken.revokedAt),
					gt(schema.mobileRefreshToken.expiresAt, now),
				),
			)
			.get(),
	]);

	return {
		activeWebSessions: webSessions?.count ?? 0,
		activeMobileTokens: mobileTokens?.count ?? 0,
		distinctWebUsers: webUsers?.count ?? 0,
		distinctMobileUsers: mobileUsers?.count ?? 0,
	};
}

export async function getAiBurnByFeature(
	db: DrizzleD1Database<typeof schema>,
	oneDayAgo: Date,
	sevenDaysAgo: Date,
): Promise<AiBurnRow[]> {
	const debitFilter = lt(schema.ledger.amount, 0);

	const [rows24h, rows7d] = await Promise.all([
		db
			.select({
				reason: schema.ledger.reason,
				credits: sql<number>`coalesce(sum(abs(${schema.ledger.amount})), 0)`,
				calls: count(),
			})
			.from(schema.ledger)
			.where(and(debitFilter, gt(schema.ledger.createdAt, oneDayAgo)))
			.groupBy(schema.ledger.reason),
		db
			.select({
				reason: schema.ledger.reason,
				credits: sql<number>`coalesce(sum(abs(${schema.ledger.amount})), 0)`,
				calls: count(),
			})
			.from(schema.ledger)
			.where(and(debitFilter, gt(schema.ledger.createdAt, sevenDaysAgo)))
			.groupBy(schema.ledger.reason),
	]);

	return mergeAiBurnRows(rows24h, rows7d);
}
