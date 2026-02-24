/**
 * Extended types for Better Auth with Ration customizations
 */

import type { Session, User } from "better-auth";

export type TierSlug = "free" | "crew_member";

// User settings stored in user.settings JSON field
export interface UserSettings {
	expirationAlertDays?: number;
	defaultGroupId?: string;
	theme?: "light" | "dark";
	allergens?: string[];
	listGeneration?: {
		lastGeneratedAt?: string;
		enabled?: boolean;
		frequency?: "off" | "daily" | "weekly" | "biweekly" | "custom";
		intervalDays?: number;
	};
	hubLayout?: {
		widgets: HubWidgetLayout[];
	};
	hubProfile?: HubProfile;
	manifestSettings?: {
		weekStart?: "sunday" | "monday";
		defaultSlots?: string[]; // e.g. ["breakfast", "lunch", "dinner"]
		showSnackSlot?: boolean;
	};
	[key: string]: unknown; // Index signature for database compatibility
}

// Hub customization types
export type HubWidgetId =
	| "hub-stats"
	| "meals-ready"
	| "meals-partial"
	| "cargo-expiring"
	| "supply-preview"
	| "manifest-preview";

export type HubProfile = "cook" | "shop" | "minimal" | "full" | "custom";

export interface HubWidgetLayout {
	id: string;
	order: number;
	size?: "sm" | "md" | "lg";
	visible: boolean;
}

export interface ManifestPreviewEntry {
	date: string; // YYYY-MM-DD
	slotType: string;
	mealName: string;
	mealId: string;
}

export interface ManifestPreviewData {
	planId: string | null;
	entries: ManifestPreviewEntry[];
}

/** Shape of loader data passed to Hub widgets. Aligns with hub route loader return. */
export interface HubLoaderData {
	expiringItems: unknown[];
	cargoStats: { totalItems: number; expiringCount: number };
	latestSupplyList: { items: unknown[] } | null;
	mealMatches: Array<
		{ canMake: boolean; matchPercentage: number } & Record<string, unknown>
	>;
	expirationAlertDays: number;
	manifestPreview: ManifestPreviewData | null;
}

/** Props passed to each Hub widget component. */
export interface HubWidgetProps {
	data: HubLoaderData;
	size: "sm" | "md" | "lg";
}

// Extended organization type with credits and metadata
export interface OrganizationMetadata {
	isPersonal?: boolean;
	[key: string]: unknown;
}

export interface OrganizationWithCredits {
	id: string;
	name: string;
	slug: string | null;
	logo: string | null;
	credits: number;
	metadata: OrganizationMetadata | null;
	createdAt: Date;
}

// Meal custom fields JSON structure
export interface MealCustomFields {
	[key: string]: unknown;
}

// Extended session with active organization
export interface SessionWithActiveOrg extends Session {
	activeOrganizationId: string | null;
}

// Complete authenticated session with user
export interface AuthSession {
	session: SessionWithActiveOrg;
	user: User;
}

// Member with user information
export interface MemberWithUser {
	id: string;
	organizationId: string;
	userId: string;
	role: "owner" | "admin" | "member";
	createdAt: Date;
	user: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	};
}

// Invitation with organization and inviter details
export interface InvitationWithDetails {
	id: string;
	organizationId: string;
	token: string;
	role: "admin" | "member";
	status: "pending" | "accepted" | "canceled";
	expiresAt: Date;
	inviterId: string;
	createdAt: Date;
	organization: {
		id: string;
		name: string;
	};
	inviter: {
		id: string;
		name: string;
		email: string;
	};
}

// Ledger entry with user info
export interface LedgerEntry {
	id: string;
	organizationId: string;
	userId: string | null;
	amount: number;
	reason: string;
	createdAt: Date;
	user?: {
		id: string;
		name: string;
	} | null;
}
