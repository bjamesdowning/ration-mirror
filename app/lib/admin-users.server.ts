import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	isNull,
	like,
	or,
	sql,
} from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { timestampToMs, userLastActiveUnixSql } from "./user-activity.server";

export type LoggedInPlatform = "web" | "mobile" | "both";

export interface LoggedInUserRow {
	id: string;
	name: string;
	email: string;
	sessionCount: number;
	platform: LoggedInPlatform;
	lastSeenAt: Date;
}

export interface LoggedInUsersResult {
	users: LoggedInUserRow[];
	totalLoggedIn: number;
}

export type AdminUserSort = "createdAt" | "lastLogin" | "lastActive" | "name";
export type AdminUserOrder = "asc" | "desc";

export interface AdminUsersListParams {
	q?: string;
	page: number;
	limit: number;
	sort: AdminUserSort;
	order: AdminUserOrder;
}

export interface AdminUserRow {
	id: string;
	name: string;
	email: string;
	isAdmin: boolean;
	createdAt: Date | null;
	lastLoginAt: Date | null;
	lastActiveAt: Date | null;
}

export interface AdminUsersListResult {
	users: AdminUserRow[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

interface WebSessionAggregate {
	userId: string;
	name: string;
	email: string;
	sessionCount: number;
	lastSeenAt: Date;
}

interface MobileSessionAggregate {
	userId: string;
	name: string;
	email: string;
	lastSeenAt: Date;
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
			lastSeenMs: row.lastSeenAt.getTime(),
		});
	}

	for (const row of mobileRows) {
		const existing = merged.get(row.userId);
		const mobileMs = row.lastSeenAt.getTime();
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

export function resolvePlatform(
	hasWeb: boolean,
	hasMobile: boolean,
): LoggedInPlatform {
	if (hasWeb && hasMobile) return "both";
	if (hasMobile) return "mobile";
	return "web";
}

export function computeLastLoginMs(
	sessionCreatedMs: number,
	mobileCreatedMs: number,
): number {
	return Math.max(sessionCreatedMs, mobileCreatedMs);
}

function lastLoginUnixSql() {
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

function buildUserSearchFilter(q?: string) {
	const trimmed = q?.trim();
	if (!trimmed) return undefined;
	const pattern = `%${trimmed}%`;
	return or(like(schema.user.name, pattern), like(schema.user.email, pattern));
}

function sortColumn(sort: AdminUserSort) {
	switch (sort) {
		case "name":
			return schema.user.name;
		case "createdAt":
			return schema.user.createdAt;
		case "lastLogin":
			return lastLoginUnixSql();
		case "lastActive":
			return userLastActiveUnixSql();
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
				lastSeenAt: sql<Date>`MAX(${schema.session.updatedAt})`,
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
				lastSeenAt: sql<Date>`MAX(${schema.mobileRefreshToken.createdAt})`,
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

	const orderFn = order === "asc" ? asc : desc;
	const rows = await db
		.select({
			id: schema.user.id,
			name: schema.user.name,
			email: schema.user.email,
			isAdmin: schema.user.isAdmin,
			createdAt: schema.user.createdAt,
			lastLoginUnix: lastLoginUnixSql(),
			lastActiveUnix: userLastActiveUnixSql(),
		})
		.from(schema.user)
		.where(whereClause)
		.orderBy(orderFn(sortColumn(sort)))
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
