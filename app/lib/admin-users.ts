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

export const DEFAULT_ADMIN_USERS_LIMIT = 25;
export const DEFAULT_ADMIN_USERS_SORT: AdminUserSort = "createdAt";
export const DEFAULT_ADMIN_USERS_ORDER: AdminUserOrder = "desc";

/** Matches `AdminUsersListSchema` max `limit` — hydration must never scan all users. */
export const ADMIN_USER_HYDRATION_MAX_IDS = 100;

export interface AdminUserPageRow {
	id: string;
	name: string;
	email: string;
	isAdmin: boolean;
	createdAt: Date | null;
	settings: { lastActiveAt?: string } | null;
}

export interface AdminUserActivityAggregate {
	userId: string;
	maxLogin?: unknown;
	maxActive?: unknown;
}

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

/** Pure helper: derive last-active timestamp from pre-aggregated sources. */
export function computeLastActiveMs(
	sessionActiveMs: number,
	apiKeyActiveMs: number,
	settingsActiveMs: number,
): number {
	return Math.max(sessionActiveMs, apiKeyActiveMs, settingsActiveMs);
}

export function computeLastLoginMs(
	sessionCreatedMs: number,
	mobileCreatedMs: number,
): number {
	return Math.max(sessionCreatedMs, mobileCreatedMs);
}

export function resolvePlatform(
	hasWeb: boolean,
	hasMobile: boolean,
): LoggedInPlatform {
	if (hasWeb && hasMobile) return "both";
	if (hasMobile) return "mobile";
	return "web";
}
