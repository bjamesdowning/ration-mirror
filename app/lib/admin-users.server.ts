import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	isNull,
	like,
	max,
	or,
	sql,
} from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type {
	AdminUserRow,
	AdminUserSort,
	AdminUsersListParams,
	AdminUsersListResult,
	LoggedInUserRow,
	LoggedInUsersResult,
} from "./admin-users";
import { resolvePlatform } from "./admin-users";

export type {
	AdminUserOrder,
	AdminUserRow,
	AdminUserSort,
	AdminUsersListParams,
	AdminUsersListResult,
	LoggedInPlatform,
	LoggedInUserRow,
	LoggedInUsersResult,
} from "./admin-users";
export {
	computeLastActiveMs,
	computeLastLoginMs,
	DEFAULT_ADMIN_USERS_LIMIT,
	DEFAULT_ADMIN_USERS_ORDER,
	DEFAULT_ADMIN_USERS_SORT,
	resolvePlatform,
} from "./admin-users";

import { timestampToMs } from "./user-activity.server";

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

function sessionAggSubquery(db: DrizzleD1Database<typeof schema>) {
	return db
		.select({
			userId: schema.session.userId,
			maxLogin: max(schema.session.createdAt).as("session_max_login"),
			maxActive: max(schema.session.updatedAt).as("session_max_active"),
		})
		.from(schema.session)
		.groupBy(schema.session.userId)
		.as("session_agg");
}

function mobileAggSubquery(db: DrizzleD1Database<typeof schema>) {
	return db
		.select({
			userId: schema.mobileRefreshToken.userId,
			maxLogin: max(schema.mobileRefreshToken.createdAt).as("mobile_max_login"),
		})
		.from(schema.mobileRefreshToken)
		.groupBy(schema.mobileRefreshToken.userId)
		.as("mobile_agg");
}

function apiKeyAggSubquery(db: DrizzleD1Database<typeof schema>) {
	return db
		.select({
			userId: schema.apiKey.userId,
			maxActive: max(schema.apiKey.lastUsedAt).as("api_key_max_active"),
		})
		.from(schema.apiKey)
		.groupBy(schema.apiKey.userId)
		.as("api_key_agg");
}

function lastLoginUnixExpr(
	sessionAgg: ReturnType<typeof sessionAggSubquery>,
	mobileAgg: ReturnType<typeof mobileAggSubquery>,
) {
	return sql<number>`MAX(COALESCE(${sessionAgg.maxLogin}, 0), COALESCE(${mobileAgg.maxLogin}, 0))`;
}

function lastActiveUnixExpr(
	sessionAgg: ReturnType<typeof sessionAggSubquery>,
	apiKeyAgg: ReturnType<typeof apiKeyAggSubquery>,
) {
	return sql<number>`MAX(
		COALESCE(${sessionAgg.maxActive}, 0),
		COALESCE(${apiKeyAgg.maxActive}, 0),
		COALESCE(unixepoch(json_extract(${schema.user.settings}, '$.lastActiveAt')), 0)
	)`;
}

/** Resolve ORDER BY expression for admin user list (JOIN-based aggregates). */
export function adminUserSortExpression(
	sort: AdminUserSort,
	aggregates: {
		sessionAgg: ReturnType<typeof sessionAggSubquery>;
		mobileAgg: ReturnType<typeof mobileAggSubquery>;
		apiKeyAgg: ReturnType<typeof apiKeyAggSubquery>;
	},
) {
	switch (sort) {
		case "name":
			return schema.user.name;
		case "createdAt":
			return schema.user.createdAt;
		case "lastLogin":
			return lastLoginUnixExpr(aggregates.sessionAgg, aggregates.mobileAgg);
		case "lastActive":
			return lastActiveUnixExpr(aggregates.sessionAgg, aggregates.apiKeyAgg);
	}
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

	const [totalResult] = await db
		.select({ count: count() })
		.from(schema.user)
		.where(whereClause);

	const total = totalResult?.count ?? 0;
	const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
	const offset = (page - 1) * limit;

	const sessionAgg = sessionAggSubquery(db);
	const mobileAgg = mobileAggSubquery(db);
	const apiKeyAgg = apiKeyAggSubquery(db);
	const aggregates = { sessionAgg, mobileAgg, apiKeyAgg };

	const orderFn = order === "asc" ? asc : desc;
	const rows = await db
		.select({
			id: schema.user.id,
			name: schema.user.name,
			email: schema.user.email,
			isAdmin: schema.user.isAdmin,
			createdAt: schema.user.createdAt,
			lastLoginUnix: lastLoginUnixExpr(sessionAgg, mobileAgg),
			lastActiveUnix: lastActiveUnixExpr(sessionAgg, apiKeyAgg),
		})
		.from(schema.user)
		.leftJoin(sessionAgg, eq(schema.user.id, sessionAgg.userId))
		.leftJoin(mobileAgg, eq(schema.user.id, mobileAgg.userId))
		.leftJoin(apiKeyAgg, eq(schema.user.id, apiKeyAgg.userId))
		.where(whereClause)
		.orderBy(orderFn(adminUserSortExpression(sort, aggregates)))
		.limit(limit)
		.offset(offset);

	const users: AdminUserRow[] = rows.map((row) => ({
		id: row.id,
		name: row.name,
		email: row.email,
		isAdmin: row.isAdmin,
		createdAt: row.createdAt,
		lastLoginAt: unixToDate(row.lastLoginUnix),
		lastActiveAt: unixToDate(row.lastActiveUnix),
	}));

	return { users, total, page, limit, totalPages };
}

function unixToDate(value: unknown): Date | null {
	const ms = timestampToMs(value);
	return ms > 0 ? new Date(ms) : null;
}
