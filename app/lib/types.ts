/**
 * Extended types for Better Auth with Ration customizations
 */

import type { Session, User } from "better-auth";
import type { AllergenSlug } from "./allergens";

export type TierSlug = "free" | "crew_member";

// User settings stored in user.settings JSON field
export interface UserSettings {
	expirationAlertDays?: number;
	defaultGroupId?: string;
	theme?: "light" | "dark";
	allergens?: AllergenSlug[];
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
		/** Number of days shown in Manifest on desktop: 3, 5, or 7. Default 5. */
		calendarSpan?: 3 | 5 | 7;
	};
	/** ISO timestamp when the user completed onboarding. Null/absent = not yet completed. */
	onboardingCompletedAt?: string;
	/** Last step index the user reached (0–5), enables resume on re-open. */
	onboardingStep?: number;
	/** Default view mode for Cargo and Galley pages. */
	viewMode?: {
		cargo?: "card" | "list";
		galley?: "card" | "list";
	};
	/** Supply list quantity display mode. */
	supplyUnitMode?: "cooking" | "metric" | "imperial";
	[key: string]: unknown; // Index signature for database compatibility
}

// Hub customization types
export type HubWidgetId =
	| "hub-stats"
	| "meals-ready"
	| "meals-partial"
	| "snacks-ready"
	| "cargo-expiring"
	| "supply-preview"
	| "manifest-preview";

export type HubProfile = "cook" | "shop" | "minimal" | "full" | "custom";

/** Slot types available for meal plan entries */
export type SlotType = "breakfast" | "lunch" | "dinner" | "snack";

/** Cargo domains available for filtering */
export type CargoDomain = "food" | "household" | "alcohol";

/**
 * Per-widget filter configuration stored alongside layout in user.settings.
 * Fields are scoped to the capabilities of each widget type.
 */
export interface HubWidgetFilters {
	/** Meal tag slugs to include (OR logic). Applies to meals-ready, meals-partial, snacks-ready, manifest-preview. */
	tags?: string[];
	/** Restrict manifest-preview to a single slot type. */
	slotType?: SlotType;
	/** Restrict cargo-expiring widget to a single cargo domain. */
	domain?: CargoDomain;
	/** Override the default result count limit for this widget (1–20). */
	limit?: number;
}

export interface HubWidgetLayout {
	id: string;
	order: number;
	size?: "sm" | "md" | "lg";
	visible: boolean;
	/** Optional per-widget filter configuration. Absent = use widget defaults. */
	filters?: HubWidgetFilters;
}

export interface ManifestPreviewEntry {
	date: string; // YYYY-MM-DD
	slotType: string;
	mealName: string;
	mealId: string;
	mealType?: string;
	servingsOverride?: number | null;
}

export interface ManifestPreviewData {
	planId: string | null;
	entries: ManifestPreviewEntry[];
}

/** Meal match result shape (matches MealMatchResult from matching.server) */
export type MealMatchResultShim = Array<
	{ canMake: boolean; matchPercentage: number } & Record<string, unknown>
>;

/** Shape of loader data passed to Hub widgets. Aligns with hub route loader return. */
export interface HubLoaderData {
	expiringItems: unknown[];
	cargoStats: { totalItems: number; expiringCount: number };
	latestSupplyList: { items: unknown[] } | null;
	/** Deferred: Promise when using deferred loader; resolves to meal (recipe) match results */
	mealMatches: MealMatchResultShim | Promise<MealMatchResultShim>;
	/**
	 * Deferred: Separate promise for meals-partial widget so its tag/limit filters
	 * are independent from the meals-ready widget even when they share the same type.
	 */
	partialMealMatches: MealMatchResultShim | Promise<MealMatchResultShim>;
	/** Deferred: Promise when using deferred loader; resolves to snack (provision) match results */
	snackMatches: MealMatchResultShim | Promise<MealMatchResultShim>;
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
