import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	like,
	max,
	or,
	sql,
} from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type {
	AdminUserActivityAggregate,
	AdminUserPageRow,
	AdminUserRow,
	AdminUserSort,
	AdminUsersListParams,
	AdminUsersListResult,
	LoggedInUserRow,
	LoggedInUsersResult,
} from "./admin-users";
import {
	ADMIN_USER_HYDRATION_MAX_IDS,
	computeLastActiveMs,
	computeLastLoginMs,
	resolvePlatform,
} from "./admin-users";
import { chunkedQuery } from "./query-utils.server";
import { timestampToMs } from "./user-activity.server";

export type {
	AdminUserActivityAggregate,
	AdminUserOrder,
	AdminUserPageRow,
	AdminUserRow,
	AdminUserSort,
	AdminUsersListParams,
	AdminUsersListResult,
	LoggedInPlatform,
	LoggedInUserRow,
	LoggedInUsersResult,
} from "./admin-users";
export {
	ADMIN_USER_HYDRATION_MAX_IDS,
	computeLastActiveMs,
	computeLastLoginMs,
	DEFAULT_ADMIN_USERS_LIMIT,
	DEFAULT_ADMIN_USERS_ORDER,
	DEFAULT_ADMIN_USERS_SORT,
	resolvePlatform,
} from "./admin-users";

/** D1 returns MAX(timestamp) as unix seconds, not Date. */
type SessionLastSeen = Date | number | string;

interface WebSessionAggregate {
	userId: string;
	name: string;
	email: string;
	sessionCount: number;
	lastSeenAt: SessionLastSeen;
}

interface MobileSessionAggregate {
	userId: string;
	name: string;
	email: string;
	lastSeenAt: SessionLastSeen;
}

function lastSeenToMs(value: SessionLastSeen): number {
	const ms = timestampToMs(value);
	if (ms > 0) return ms;
	if (typeof value === "string") {
		const parsed = new Date(value).getTime();
		if (!Number.isNaN(parsed)) return parsed;
	}
	return 0;
}

/** Merge web and mobile session aggregates into a sorted, de-duplicated list. */
export function mergeLoggedInUsers(
	webRows: WebSessionAggregate[],
	mobileRows: MobileSessionAggregate[],
	limit: number,
): LoggedInUserRow[] {
	const merged = new Map<
		string,
		{
			id: string;
			name: string;
			email: string;
			sessionCount: number;
			hasWeb: boolean;
			hasMobile: boolean;
			lastSeenMs: number;
		}
	>();

	for (const row of webRows) {
		merged.set(row.userId, {
			id: row.userId,
			name: row.name,
			email: row.email,
			sessionCount: row.sessionCount,
			hasWeb: true,
			hasMobile: false,
			lastSeenMs: lastSeenToMs(row.lastSeenAt),
		});
	}

	for (const row of mobileRows) {
		const existing = merged.get(row.userId);
		const mobileMs = lastSeenToMs(row.lastSeenAt);
		if (existing) {
			existing.hasMobile = true;
			existing.lastSeenMs = Math.max(existing.lastSeenMs, mobileMs);
		} else {
			merged.set(row.userId, {
				id: row.userId,
				name: row.name,
				email: row.email,
				sessionCount: 0,
				hasWeb: false,
				hasMobile: true,
				lastSeenMs: mobileMs,
			});
		}
	}

	return Array.from(merged.values())
		.sort((a, b) => b.lastSeenMs - a.lastSeenMs)
		.slice(0, limit)
		.map((row) => ({
			id: row.id,
			name: row.name,
			email: row.email,
			sessionCount: row.sessionCount,
			platform: resolvePlatform(row.hasWeb, row.hasMobile),
			lastSeenAt: new Date(row.lastSeenMs),
		}));
}

export function buildUserSearchFilter(q?: string) {
	const trimmed = q?.trim();
	if (!trimmed) return undefined;
	const pattern = `%${trimmed}%`;
	return or(like(schema.user.name, pattern), like(schema.user.email, pattern));
}

function lastLoginCorrelatedExpr() {
	return sql<number>`MAX(
		COALESCE(
			(
				SELECT MAX(${schema.session.createdAt})
				FROM ${schema.session}
				WHERE ${schema.session.userId} = ${schema.user.id}
			),
			0
		),
		COALESCE(
			(
				SELECT MAX(${schema.mobileRefreshToken.createdAt})
				FROM ${schema.mobileRefreshToken}
				WHERE ${schema.mobileRefreshToken.userId} = ${schema.user.id}
			),
			0
		)
	)`;
}

function lastActiveCorrelatedExpr() {
	return sql<number>`MAX(
		COALESCE(
			(
				SELECT MAX(${schema.session.updatedAt})
				FROM ${schema.session}
				WHERE ${schema.session.userId} = ${schema.user.id}
			),
			0
		),
		COALESCE(
			(
				SELECT MAX(${schema.apiKey.lastUsedAt})
				FROM ${schema.apiKey}
				WHERE ${schema.apiKey.userId} = ${schema.user.id}
			),
			0
		),
		COALESCE(unixepoch(json_extract(${schema.user.settings}, '$.lastActiveAt')), 0)
	)`;
}

/** ORDER BY for the user-table page query. lastLogin/lastActive use indexed correlated MAX, not full-table GROUP BY joins. */
export function adminUserSortExpression(sort: AdminUserSort) {
	switch (sort) {
		case "name":
			return schema.user.name;
		case "createdAt":
			return schema.user.createdAt;
		case "lastLogin":
			return lastLoginCorrelatedExpr();
		case "lastActive":
			return lastActiveCorrelatedExpr();
	}
}

export function assertBoundedAdminUserIds(ids: string[]): string[] {
	if (ids.length > ADMIN_USER_HYDRATION_MAX_IDS) {
		throw new Error(
			`Admin user hydration refused ${ids.length} ids (max ${ADMIN_USER_HYDRATION_MAX_IDS})`,
		);
	}
	return ids;
}

/** Returns null when wave 2 should be skipped (empty page). */
export function adminUserHydrationIds(ids: string[]): string[] | null {
	const bounded = assertBoundedAdminUserIds(ids);
	if (bounded.length === 0) return null;
	return bounded;
}

function settingsLastActiveMs(
	settings: AdminUserPageRow["settings"] | unknown,
): number {
	if (!settings || typeof settings !== "object") return 0;
	const iso = (settings as { lastActiveAt?: string }).lastActiveAt;
	if (!iso) return 0;
	const parsed = new Date(iso).getTime();
	return Number.isNaN(parsed) ? 0 : parsed;
}

export function hydrateAdminUserRows(
	pageRows: AdminUserPageRow[],
	sessionRows: AdminUserActivityAggregate[],
	mobileRows: AdminUserActivityAggregate[],
	apiKeyRows: AdminUserActivityAggregate[],
): AdminUserRow[] {
	const sessionByUser = new Map(sessionRows.map((row) => [row.userId, row]));
	const mobileByUser = new Map(mobileRows.map((row) => [row.userId, row]));
	const apiKeyByUser = new Map(apiKeyRows.map((row) => [row.userId, row]));

	return pageRows.map((row) => {
		const session = sessionByUser.get(row.id);
		const mobile = mobileByUser.get(row.id);
		const apiKey = apiKeyByUser.get(row.id);
		const lastLoginMs = computeLastLoginMs(
			timestampToMs(session?.maxLogin),
			timestampToMs(mobile?.maxLogin),
		);
		const lastActiveMs = computeLastActiveMs(
			timestampToMs(session?.maxActive),
			timestampToMs(apiKey?.maxActive),
			settingsLastActiveMs(row.settings),
		);
		return {
			id: row.id,
			name: row.name,
			email: row.email,
			isAdmin: row.isAdmin,
			createdAt: row.createdAt,
			lastLoginAt: lastLoginMs > 0 ? new Date(lastLoginMs) : null,
			lastActiveAt: lastActiveMs > 0 ? new Date(lastActiveMs) : null,
		};
	});
}

export async function getLoggedInUsers(
	db: DrizzleD1Database<typeof schema>,
	now: Date,
	limit = 15,
): Promise<LoggedInUsersResult> {
	const [webRows, mobileRows] = await Promise.all([
		db
			.select({
				userId: schema.session.userId,
				name: schema.user.name,
				email: schema.user.email,
				sessionCount: count(),
				lastSeenAt: sql<number>`MAX(${schema.session.updatedAt})`,
			})
			.from(schema.session)
			.innerJoin(schema.user, eq(schema.session.userId, schema.user.id))
			.where(gt(schema.session.expiresAt, now))
			.groupBy(schema.session.userId, schema.user.name, schema.user.email),
		db
			.select({
				userId: schema.mobileRefreshToken.userId,
				name: schema.user.name,
				email: schema.user.email,
				lastSeenAt: sql<number>`MAX(${schema.mobileRefreshToken.createdAt})`,
			})
			.from(schema.mobileRefreshToken)
			.innerJoin(
				schema.user,
				eq(schema.mobileRefreshToken.userId, schema.user.id),
			)
			.where(
				and(
					isNull(schema.mobileRefreshToken.revokedAt),
					gt(schema.mobileRefreshToken.expiresAt, now),
				),
			)
			.groupBy(
				schema.mobileRefreshToken.userId,
				schema.user.name,
				schema.user.email,
			),
	]);

	// Derive total from merged rows — avoids a raw NOT EXISTS subquery that binds
	// Date inconsistently in D1 when mixed with drizzle gt() params.
	const allLoggedIn = mergeLoggedInUsers(
		webRows,
		mobileRows,
		Number.MAX_SAFE_INTEGER,
	);

	return {
		users: allLoggedIn.slice(0, limit),
		totalLoggedIn: allLoggedIn.length,
	};
}

export async function listAdminUsers(
	db: DrizzleD1Database<typeof schema>,
	params: AdminUsersListParams,
): Promise<AdminUsersListResult> {
	const { page, limit, sort, order } = params;
	const searchFilter = buildUserSearchFilter(params.q);
	const whereClause = searchFilter ?? undefined;
	const offset = (page - 1) * limit;
	const orderFn = order === "asc" ? asc : desc;

	const [totalResult, pageRows] = await Promise.all([
		db.select({ count: count() }).from(schema.user).where(whereClause),
		db
			.select({
				id: schema.user.id,
				name: schema.user.name,
				email: schema.user.email,
				isAdmin: schema.user.isAdmin,
				createdAt: schema.user.createdAt,
				settings: schema.user.settings,
			})
			.from(schema.user)
			.where(whereClause)
			.orderBy(orderFn(adminUserSortExpression(sort)))
			.limit(limit)
			.offset(offset),
	]);

	const total = totalResult[0]?.count ?? 0;
	const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
	const hydrationIds = adminUserHydrationIds(pageRows.map((row) => row.id));

	if (!hydrationIds) {
		return { users: [], total, page, limit, totalPages };
	}

	const [sessionRows, mobileRows, apiKeyRows] = await Promise.all([
		chunkedQuery(hydrationIds, (chunk) =>
			db
				.select({
					userId: schema.session.userId,
					maxLogin: max(schema.session.createdAt),
					maxActive: max(schema.session.updatedAt),
				})
				.from(schema.session)
				.where(inArray(schema.session.userId, chunk))
				.groupBy(schema.session.userId),
		),
		chunkedQuery(hydrationIds, (chunk) =>
			db
				.select({
					userId: schema.mobileRefreshToken.userId,
					maxLogin: max(schema.mobileRefreshToken.createdAt),
				})
				.from(schema.mobileRefreshToken)
				.where(inArray(schema.mobileRefreshToken.userId, chunk))
				.groupBy(schema.mobileRefreshToken.userId),
		),
		chunkedQuery(hydrationIds, (chunk) =>
			db
				.select({
					userId: schema.apiKey.userId,
					maxActive: max(schema.apiKey.lastUsedAt),
				})
				.from(schema.apiKey)
				.where(inArray(schema.apiKey.userId, chunk))
				.groupBy(schema.apiKey.userId),
		),
	]);

	return {
		users: hydrateAdminUserRows(pageRows, sessionRows, mobileRows, apiKeyRows),
		total,
		page,
		limit,
		totalPages,
	};
}
