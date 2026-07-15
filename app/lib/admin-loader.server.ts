import {
	and,
	count,
	desc,
	eq,
	gt,
	gte,
	inArray,
	lt,
	lte,
	sql,
} from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type {
	ActivationRateResult,
	AiBurnRow,
	CrewHealthResult,
	DauWauMauResult,
	OrgEngagementMedians,
	PlatformSplitResult,
} from "./admin-metrics.server";
import {
	getActivationRate,
	getAiBurnByFeature,
	getCrewHealth,
	getDauWauMau,
	getOrgEngagementMedians,
	getPlatformSplit,
} from "./admin-metrics.server";
import type { AdminUsersListResult } from "./admin-users";
import {
	DEFAULT_ADMIN_USERS_LIMIT,
	DEFAULT_ADMIN_USERS_ORDER,
	DEFAULT_ADMIN_USERS_SORT,
} from "./admin-users";
import { getLoggedInUsers, listAdminUsers } from "./admin-users.server";
import { getExpiringCargoBounds } from "./cargo-utils";
import { log } from "./logging.server";

/** Max parallel D1 reads per admin loader invocation. */
export const ADMIN_D1_CONCURRENCY = 8;

export const ADMIN_METRICS_CACHE_KEY = "admin:metrics:v1";
export const ADMIN_METRICS_CACHE_TTL_SEC = 180;

export type SafeMetricResult<T> =
	| { status: "ok"; data: T }
	| { status: "error" };

export interface AdminHeavyMetricsResponse {
	dauWauMau: SafeMetricResult<DauWauMauResult>;
	activationRate: SafeMetricResult<ActivationRateResult>;
	crewHealth: SafeMetricResult<CrewHealthResult>;
	orgMedians: SafeMetricResult<OrgEngagementMedians>;
	platformSplit: SafeMetricResult<PlatformSplitResult>;
	aiBurnByFeature: SafeMetricResult<AiBurnRow[]>;
	cachedAt: number | null;
}

export interface CriticalAdminDashboardData {
	userCount: number;
	inventoryCount: number;
	burnedCredits: number;
	crewMemberCount: number;
	totalCredits: number;
	activeUsers: number;
	activeSessions: number;
	newSignups7d: number;
	newSignups30d: number;
	newSignups24h: number;
	newCargo24h: number;
	newMeals24h: number;
	creditsAdded24h: number;
	creditsConsumed24h: number;
	aiCalls24h: number;
	crewConversions24h: number;
	groupCount: number;
	mealCount: number;
	activeMealCount: number;
	groceryListCount: number;
	scanCount: number;
	mealPlanCount: number;
	pendingInvites: number;
	expiringItems: number;
	verifiedEmailRate: number;
	topOrgsByCargo: { orgId: string; orgName: string; count: number }[];
	topOrgsByMeal: { orgId: string; orgName: string; count: number }[];
	loggedInUsers: Awaited<ReturnType<typeof getLoggedInUsers>>["users"];
	totalLoggedIn: number;
	initialUsers: AdminUsersListResult;
}

/** Run async tasks with a bounded concurrency pool. */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) return [];
	const poolSize = Math.max(1, Math.min(limit, items.length));
	const results = new Array<R>(items.length);
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await fn(items[index], index);
		}
	}

	await Promise.all(Array.from({ length: poolSize }, () => worker()));
	return results;
}

export async function runSafeMetric<T>(
	label: string,
	fn: () => Promise<T>,
): Promise<SafeMetricResult<T>> {
	try {
		return { status: "ok", data: await fn() };
	} catch (error) {
		log.error(`[admin.metrics] ${label} failed`, error);
		return { status: "error" };
	}
}

interface AdminTimeWindow {
	now: Date;
	oneDayAgo: Date;
	sevenDaysAgo: Date;
	thirtyDaysAgo: Date;
	sevenDaysFromNow: Date;
	cargoExpiringFrom: Date;
	cargoExpiringThrough: Date;
}

function buildAdminTimeWindow(now = new Date()): AdminTimeWindow {
	const { startOfToday: cargoExpiringFrom, endOfWindow: cargoExpiringThrough } =
		getExpiringCargoBounds(7, now);
	return {
		now,
		oneDayAgo: new Date(now.getTime() - 24 * 60 * 60 * 1000),
		sevenDaysAgo: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
		thirtyDaysAgo: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
		sevenDaysFromNow: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
		cargoExpiringFrom,
		cargoExpiringThrough,
	};
}

type CriticalQueryResult =
	| { key: "userCount"; value: number }
	| { key: "inventoryCount"; value: number }
	| { key: "burnedResult"; value: { burned: number } | undefined }
	| { key: "crewMemberCountResult"; value: { count: number } | undefined }
	| { key: "totalCreditsResult"; value: { total: number } | undefined }
	| { key: "activeUsersResult"; value: { count: number } | undefined }
	| { key: "activeSessionsResult"; value: { count: number } | undefined }
	| { key: "newSignups7dResult"; value: { count: number } | undefined }
	| { key: "newSignups30dResult"; value: { count: number } | undefined }
	| { key: "newSignups24hResult"; value: { count: number } | undefined }
	| { key: "newCargo24hResult"; value: { count: number } | undefined }
	| { key: "newMeals24hResult"; value: { count: number } | undefined }
	| { key: "creditsAdded24hResult"; value: { total: number } | undefined }
	| { key: "creditsConsumed24hResult"; value: { total: number } | undefined }
	| { key: "aiCalls24hResult"; value: { count: number } | undefined }
	| { key: "crewConversions24hResult"; value: { count: number } | undefined }
	| { key: "groupCount"; value: number }
	| { key: "mealCount"; value: number }
	| { key: "activeMealCount"; value: number }
	| { key: "groceryListCount"; value: number }
	| { key: "scanCountResult"; value: { count: number } | undefined }
	| { key: "mealPlanCount"; value: number }
	| { key: "pendingInvitesResult"; value: { count: number } | undefined }
	| { key: "expiringItemsResult"; value: { count: number } | undefined }
	| { key: "verifiedUsersResult"; value: { count: number } | undefined }
	| {
			key: "topOrgsByCargoResult";
			value: { organizationId: string; itemCount: number }[];
	  }
	| {
			key: "topOrgsByMealResult";
			value: { organizationId: string; mealCount: number }[];
	  }
	| {
			key: "loggedInResult";
			value: Awaited<ReturnType<typeof getLoggedInUsers>>;
	  }
	| { key: "initialUsers"; value: AdminUsersListResult };

function buildCriticalQueries(
	db: DrizzleD1Database<typeof schema>,
	window: AdminTimeWindow,
): Array<() => Promise<CriticalQueryResult>> {
	const {
		now,
		oneDayAgo,
		sevenDaysAgo,
		thirtyDaysAgo,
		cargoExpiringFrom,
		cargoExpiringThrough,
	} = window;

	return [
		async () => ({ key: "userCount", value: await db.$count(schema.user) }),
		async () => ({
			key: "inventoryCount",
			value: await db.$count(schema.cargo),
		}),
		async () => ({
			key: "burnedResult",
			value: await db
				.select({
					burned: sql<number>`sum(case when ${schema.ledger.amount} < 0 then abs(${schema.ledger.amount}) else 0 end)`,
				})
				.from(schema.ledger)
				.get(),
		}),
		async () => ({
			key: "crewMemberCountResult",
			value: await db
				.select({ count: count() })
				.from(schema.user)
				.where(eq(schema.user.tier, "crew_member"))
				.get(),
		}),
		async () => ({
			key: "totalCreditsResult",
			value: await db
				.select({
					total: sql<number>`coalesce(sum(${schema.organization.credits}), 0)`,
				})
				.from(schema.organization)
				.get(),
		}),
		async () => ({
			key: "activeUsersResult",
			value: await db
				.select({
					count: sql<number>`count(distinct ${schema.session.userId})`,
				})
				.from(schema.session)
				.where(gt(schema.session.expiresAt, now))
				.get(),
		}),
		async () => ({
			key: "activeSessionsResult",
			value: await db
				.select({ count: count() })
				.from(schema.session)
				.where(gt(schema.session.expiresAt, now))
				.get(),
		}),
		async () => ({
			key: "newSignups7dResult",
			value: await db
				.select({ count: count() })
				.from(schema.user)
				.where(gt(schema.user.createdAt, sevenDaysAgo))
				.get(),
		}),
		async () => ({
			key: "newSignups30dResult",
			value: await db
				.select({ count: count() })
				.from(schema.user)
				.where(gt(schema.user.createdAt, thirtyDaysAgo))
				.get(),
		}),
		async () => ({
			key: "newSignups24hResult",
			value: await db
				.select({ count: count() })
				.from(schema.user)
				.where(gt(schema.user.createdAt, oneDayAgo))
				.get(),
		}),
		async () => ({
			key: "newCargo24hResult",
			value: await db
				.select({ count: count() })
				.from(schema.cargo)
				.where(gt(schema.cargo.createdAt, oneDayAgo))
				.get(),
		}),
		async () => ({
			key: "newMeals24hResult",
			value: await db
				.select({ count: count() })
				.from(schema.meal)
				.where(gt(schema.meal.createdAt, oneDayAgo))
				.get(),
		}),
		async () => ({
			key: "creditsAdded24hResult",
			value: await db
				.select({
					total: sql<number>`coalesce(sum(${schema.ledger.amount}), 0)`,
				})
				.from(schema.ledger)
				.where(
					and(
						gt(schema.ledger.amount, 0),
						gt(schema.ledger.createdAt, oneDayAgo),
					),
				)
				.get(),
		}),
		async () => ({
			key: "creditsConsumed24hResult",
			value: await db
				.select({
					total: sql<number>`coalesce(sum(abs(${schema.ledger.amount})), 0)`,
				})
				.from(schema.ledger)
				.where(
					and(
						lt(schema.ledger.amount, 0),
						gt(schema.ledger.createdAt, oneDayAgo),
					),
				)
				.get(),
		}),
		async () => ({
			key: "aiCalls24hResult",
			value: await db
				.select({ count: count() })
				.from(schema.ledger)
				.where(
					and(
						lt(schema.ledger.amount, 0),
						gt(schema.ledger.createdAt, oneDayAgo),
					),
				)
				.get(),
		}),
		async () => ({
			key: "crewConversions24hResult",
			value: await db
				.select({ count: count() })
				.from(schema.user)
				.where(
					and(
						eq(schema.user.tier, "crew_member"),
						gt(schema.user.crewSubscribedAt, oneDayAgo),
					),
				)
				.get(),
		}),
		async () => ({
			key: "groupCount",
			value: await db.$count(schema.organization),
		}),
		async () => ({ key: "mealCount", value: await db.$count(schema.meal) }),
		async () => ({
			key: "activeMealCount",
			value: await db.$count(schema.activeMealSelection),
		}),
		async () => ({
			key: "groceryListCount",
			value: await db.$count(schema.supplyList),
		}),
		async () => ({
			key: "scanCountResult",
			value: await db
				.select({ count: count() })
				.from(schema.ledger)
				.where(eq(schema.ledger.reason, "scan"))
				.get(),
		}),
		async () => ({
			key: "mealPlanCount",
			value: await db.$count(schema.mealPlan),
		}),
		async () => ({
			key: "pendingInvitesResult",
			value: await db
				.select({ count: count() })
				.from(schema.invitation)
				.where(eq(schema.invitation.status, "pending"))
				.get(),
		}),
		async () => ({
			key: "expiringItemsResult",
			value: await db
				.select({ count: count() })
				.from(schema.cargo)
				.where(
					and(
						gte(schema.cargo.expiresAt, cargoExpiringFrom),
						lte(schema.cargo.expiresAt, cargoExpiringThrough),
					),
				)
				.get(),
		}),
		async () => ({
			key: "verifiedUsersResult",
			value: await db
				.select({ count: count() })
				.from(schema.user)
				.where(eq(schema.user.emailVerified, true))
				.get(),
		}),
		async () => ({
			key: "topOrgsByCargoResult",
			value: await db
				.select({
					organizationId: schema.cargo.organizationId,
					itemCount: count(),
				})
				.from(schema.cargo)
				.groupBy(schema.cargo.organizationId)
				.orderBy(desc(count()))
				.limit(5),
		}),
		async () => ({
			key: "topOrgsByMealResult",
			value: await db
				.select({
					organizationId: schema.meal.organizationId,
					mealCount: count(),
				})
				.from(schema.meal)
				.groupBy(schema.meal.organizationId)
				.orderBy(desc(count()))
				.limit(5),
		}),
		async () => ({
			key: "loggedInResult",
			value: await getLoggedInUsers(db, now, 15),
		}),
		async () => ({
			key: "initialUsers",
			value: await listAdminUsers(db, {
				page: 1,
				limit: DEFAULT_ADMIN_USERS_LIMIT,
				sort: DEFAULT_ADMIN_USERS_SORT,
				order: DEFAULT_ADMIN_USERS_ORDER,
			}),
		}),
	];
}

function collectCriticalResults(results: CriticalQueryResult[]) {
	const map = new Map(results.map((result) => [result.key, result.value]));

	const userCount = map.get("userCount") as number;
	const verifiedUsersResult = map.get("verifiedUsersResult") as
		| { count: number }
		| undefined;

	return {
		userCount,
		inventoryCount: map.get("inventoryCount") as number,
		burnedCredits:
			(map.get("burnedResult") as { burned: number } | undefined)?.burned ?? 0,
		crewMemberCount:
			(map.get("crewMemberCountResult") as { count: number } | undefined)
				?.count ?? 0,
		totalCredits:
			(map.get("totalCreditsResult") as { total: number } | undefined)?.total ??
			0,
		activeUsers:
			(map.get("activeUsersResult") as { count: number } | undefined)?.count ??
			0,
		activeSessions:
			(map.get("activeSessionsResult") as { count: number } | undefined)
				?.count ?? 0,
		newSignups7d:
			(map.get("newSignups7dResult") as { count: number } | undefined)?.count ??
			0,
		newSignups30d:
			(map.get("newSignups30dResult") as { count: number } | undefined)
				?.count ?? 0,
		newSignups24h:
			(map.get("newSignups24hResult") as { count: number } | undefined)
				?.count ?? 0,
		newCargo24h:
			(map.get("newCargo24hResult") as { count: number } | undefined)?.count ??
			0,
		newMeals24h:
			(map.get("newMeals24hResult") as { count: number } | undefined)?.count ??
			0,
		creditsAdded24h:
			(map.get("creditsAdded24hResult") as { total: number } | undefined)
				?.total ?? 0,
		creditsConsumed24h:
			(map.get("creditsConsumed24hResult") as { total: number } | undefined)
				?.total ?? 0,
		aiCalls24h:
			(map.get("aiCalls24hResult") as { count: number } | undefined)?.count ??
			0,
		crewConversions24h:
			(map.get("crewConversions24hResult") as { count: number } | undefined)
				?.count ?? 0,
		groupCount: map.get("groupCount") as number,
		mealCount: map.get("mealCount") as number,
		activeMealCount: map.get("activeMealCount") as number,
		groceryListCount: map.get("groceryListCount") as number,
		scanCount:
			(map.get("scanCountResult") as { count: number } | undefined)?.count ?? 0,
		mealPlanCount: map.get("mealPlanCount") as number,
		pendingInvites:
			(map.get("pendingInvitesResult") as { count: number } | undefined)
				?.count ?? 0,
		expiringItems:
			(map.get("expiringItemsResult") as { count: number } | undefined)
				?.count ?? 0,
		verifiedEmailRate:
			userCount > 0 ? ((verifiedUsersResult?.count ?? 0) / userCount) * 100 : 0,
		topOrgsByCargoResult: map.get("topOrgsByCargoResult") as {
			organizationId: string;
			itemCount: number;
		}[],
		topOrgsByMealResult: map.get("topOrgsByMealResult") as {
			organizationId: string;
			mealCount: number;
		}[],
		loggedInUsers: (
			map.get("loggedInResult") as Awaited<ReturnType<typeof getLoggedInUsers>>
		).users,
		totalLoggedIn: (
			map.get("loggedInResult") as Awaited<ReturnType<typeof getLoggedInUsers>>
		).totalLoggedIn,
		initialUsers: map.get("initialUsers") as AdminUsersListResult,
	};
}

export async function loadCriticalAdminDashboard(
	db: DrizzleD1Database<typeof schema>,
	now = new Date(),
): Promise<CriticalAdminDashboardData> {
	const window = buildAdminTimeWindow(now);
	const queries = buildCriticalQueries(db, window);
	const results = await mapWithConcurrency(
		queries,
		ADMIN_D1_CONCURRENCY,
		(run) => run(),
	);
	const collected = collectCriticalResults(results);

	const heavyHitterOrgIds = Array.from(
		new Set([
			...collected.topOrgsByCargoResult.map((row) => row.organizationId),
			...collected.topOrgsByMealResult.map((row) => row.organizationId),
		]),
	);

	const orgNames: Record<string, string> = {};
	if (heavyHitterOrgIds.length > 0) {
		const orgs = await db
			.select({ id: schema.organization.id, name: schema.organization.name })
			.from(schema.organization)
			.where(inArray(schema.organization.id, heavyHitterOrgIds))
			.limit(10);
		for (const org of orgs) {
			orgNames[org.id] = org.name;
		}
	}

	return {
		userCount: collected.userCount,
		inventoryCount: collected.inventoryCount,
		burnedCredits: collected.burnedCredits,
		crewMemberCount: collected.crewMemberCount,
		totalCredits: collected.totalCredits,
		activeUsers: collected.activeUsers,
		activeSessions: collected.activeSessions,
		newSignups7d: collected.newSignups7d,
		newSignups30d: collected.newSignups30d,
		newSignups24h: collected.newSignups24h,
		newCargo24h: collected.newCargo24h,
		newMeals24h: collected.newMeals24h,
		creditsAdded24h: collected.creditsAdded24h,
		creditsConsumed24h: collected.creditsConsumed24h,
		aiCalls24h: collected.aiCalls24h,
		crewConversions24h: collected.crewConversions24h,
		groupCount: collected.groupCount,
		mealCount: collected.mealCount,
		activeMealCount: collected.activeMealCount,
		groceryListCount: collected.groceryListCount,
		scanCount: collected.scanCount,
		mealPlanCount: collected.mealPlanCount,
		pendingInvites: collected.pendingInvites,
		expiringItems: collected.expiringItems,
		verifiedEmailRate: collected.verifiedEmailRate,
		topOrgsByCargo: collected.topOrgsByCargoResult.map((row) => ({
			orgId: row.organizationId,
			orgName: orgNames[row.organizationId] ?? row.organizationId,
			count: row.itemCount,
		})),
		topOrgsByMeal: collected.topOrgsByMealResult.map((row) => ({
			orgId: row.organizationId,
			orgName: orgNames[row.organizationId] ?? row.organizationId,
			count: row.mealCount,
		})),
		loggedInUsers: collected.loggedInUsers,
		totalLoggedIn: collected.totalLoggedIn,
		initialUsers: collected.initialUsers,
	};
}

async function computeHeavyAdminMetrics(
	db: DrizzleD1Database<typeof schema>,
	now: Date,
): Promise<Omit<AdminHeavyMetricsResponse, "cachedAt">> {
	const window = buildAdminTimeWindow(now);
	const { oneDayAgo, sevenDaysAgo, sevenDaysFromNow } = window;

	const [
		dauWauMau,
		activationRate,
		crewHealth,
		orgMedians,
		platformSplit,
		aiBurnByFeature,
	] = await Promise.all([
		runSafeMetric("dauWauMau", () => getDauWauMau(db, now)),
		runSafeMetric("activationRate", () => getActivationRate(db)),
		runSafeMetric("crewHealth", () => getCrewHealth(db, now, sevenDaysFromNow)),
		runSafeMetric("orgMedians", () => getOrgEngagementMedians(db)),
		runSafeMetric("platformSplit", () => getPlatformSplit(db, now)),
		runSafeMetric("aiBurnByFeature", () =>
			getAiBurnByFeature(db, oneDayAgo, sevenDaysAgo),
		),
	]);

	return {
		dauWauMau,
		activationRate,
		crewHealth,
		orgMedians,
		platformSplit,
		aiBurnByFeature,
	};
}

export async function loadHeavyAdminMetrics(
	db: DrizzleD1Database<typeof schema>,
	kv: KVNamespace | undefined,
	now = new Date(),
): Promise<AdminHeavyMetricsResponse> {
	if (kv) {
		try {
			const cached = await kv.get(ADMIN_METRICS_CACHE_KEY, "json");
			if (cached && typeof cached === "object" && cached !== null) {
				return cached as AdminHeavyMetricsResponse;
			}
		} catch (error) {
			log.warn("[admin.metrics] KV cache read failed", {
				errorMessage: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const metrics = await computeHeavyAdminMetrics(db, now);
	const response: AdminHeavyMetricsResponse = {
		...metrics,
		cachedAt: Date.now(),
	};

	if (kv) {
		try {
			await kv.put(ADMIN_METRICS_CACHE_KEY, JSON.stringify(response), {
				expirationTtl: ADMIN_METRICS_CACHE_TTL_SEC,
			});
		} catch (error) {
			log.warn("[admin.metrics] KV cache write failed", {
				errorMessage: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return response;
}
