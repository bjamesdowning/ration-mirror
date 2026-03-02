import type { CargoIndexRow } from "~/lib/cargo-index.server";

// ---------------------------------------------------------------------------
// Cargo
// ---------------------------------------------------------------------------

export interface CargoItemOverrides {
	id?: string;
	organizationId?: string;
	name?: string;
	quantity?: number;
	unit?: string;
	tags?: string[];
	domain?: string;
	status?: string;
	expiresAt?: Date | null;
	createdAt?: Date;
	updatedAt?: Date;
}

export function createCargoItem(overrides: CargoItemOverrides = {}) {
	const now = new Date("2025-01-01T00:00:00Z");
	return {
		id: crypto.randomUUID(),
		organizationId: crypto.randomUUID(),
		name: "Test Item",
		quantity: 1,
		unit: "g",
		tags: [] as string[],
		domain: "food",
		status: "stable",
		expiresAt: null as Date | null,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

export function createCargoIndexRow(
	overrides: Partial<CargoIndexRow> = {},
): CargoIndexRow {
	return {
		id: crypto.randomUUID(),
		name: "Test Item",
		domain: "food",
		quantity: 100,
		unit: "g",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Meal Ingredients
// ---------------------------------------------------------------------------

export interface MealIngredientOverrides {
	id?: string;
	mealId?: string;
	cargoId?: string | null;
	ingredientName?: string;
	quantity?: number;
	unit?: string;
	isOptional?: boolean;
	orderIndex?: number;
}

export function createMealIngredient(overrides: MealIngredientOverrides = {}) {
	return {
		id: crypto.randomUUID(),
		mealId: crypto.randomUUID(),
		cargoId: null as string | null,
		ingredientName: "Test Ingredient",
		quantity: 100,
		unit: "g",
		isOptional: false,
		orderIndex: 0,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export interface OrganizationOverrides {
	id?: string;
	name?: string;
	slug?: string | null;
	logo?: string | null;
	credits?: number;
	createdAt?: Date;
}

export function createOrganization(overrides: OrganizationOverrides = {}) {
	return {
		id: crypto.randomUUID(),
		name: "Test Org",
		slug: "test-org",
		logo: null as string | null,
		credits: 100,
		createdAt: new Date("2025-01-01T00:00:00Z"),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export interface UserOverrides {
	id?: string;
	name?: string;
	email?: string;
	tier?: "free" | "crew_member";
	tierExpiresAt?: Date | null;
}

export function createUser(overrides: UserOverrides = {}) {
	return {
		id: crypto.randomUUID(),
		name: "Test User",
		email: `test-${crypto.randomUUID()}@example.com`,
		emailVerified: true,
		image: null as string | null,
		isAdmin: false,
		tier: "free" as "free" | "crew_member",
		tierExpiresAt: null as Date | null,
		createdAt: new Date("2025-01-01T00:00:00Z"),
		updatedAt: new Date("2025-01-01T00:00:00Z"),
		...overrides,
	};
}
