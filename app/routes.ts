import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	route("robots.txt", "routes/robots-txt.ts"),
	index("routes/home.tsx"),
	route("invitations/accept", "routes/invitations.accept.tsx"),
	route("select-group", "routes/select-group.tsx"),

	// Hub
	route("hub", "routes/hub.tsx", [
		index("routes/hub/index.tsx"),
		route("settings", "routes/hub/settings.tsx"),
		route("checkout/return", "routes/hub/checkout.return.tsx"),
		route("pricing", "routes/hub/pricing.tsx"),

		// Cargo
		route("cargo", "routes/hub/cargo.tsx"),

		// Galley
		route("galley", "routes/hub/galley.tsx"),
		route("galley/new", "routes/hub/galley.new.tsx"),
		route("galley/:id", "routes/hub/galley.$id.tsx"),
		route("galley/:id/edit", "routes/hub/galley.$id.edit.tsx"),

		// Groups
		route("groups/new", "routes/hub/groups.new.tsx"),

		// Supply
		route("supply", "routes/hub/supply.tsx"),

		// Manifest (Meal Planning Calendar)
		route("manifest", "routes/hub/manifest.tsx"),
	]),

	// Admin
	route("admin", "routes/admin.tsx"),

	// Shared (public) routes
	route("shared/:token", "routes/shared.$token.tsx"),
	route("shared/manifest/:token", "routes/shared.manifest.$token.tsx"),

	// API - Admin
	route("api/admin/users", "routes/api/admin.users.ts"),
	route(
		"api/shared/:token/items/:itemId",
		"routes/api/shared.$token.items.$itemId.ts",
	),

	// API - Meals
	route("api/meals", "routes/api/meals.ts"),
	route("api/meals/match", "routes/api/meals.match.ts"),
	route("api/meals/:id", "routes/api/meals.$id.ts"),
	route("api/meals/:id/cook", "routes/api/meals.$id.cook.ts"),
	route("api/meals/generate", "routes/api/meals.generate.ts"),
	route("api/meals/clear-selections", "routes/api/meals.clear-selections.ts"),
	route("api/meals/:id/toggle-active", "routes/api/meals.$id.toggle-active.ts"),
	route("api/meals/import", "routes/api/meals.import.ts"),

	// API - Provisions (single-item meals)
	route("api/provisions", "routes/api/provisions.ts"),
	route("api/provisions/:id", "routes/api/provisions.$id.ts"),

	// API - Cargo (static paths before :id)
	route("api/cargo/export", "routes/api/cargo.export.ts"),
	route("api/cargo/batch", "routes/api/cargo.batch.tsx"),

	// API - Galley
	route("api/galley/export", "routes/api/galley.export.ts"),
	route("api/galley/import", "routes/api/galley.import.ts"),
	route("api/cargo/:id", "routes/api/cargo.$id.ts"),

	// API - v1 programmatic (API key auth)
	route("api/v1/inventory/export", "routes/api/v1.inventory.export.ts"),
	route("api/v1/inventory/import", "routes/api/v1.inventory.import.ts"),
	route("api/v1/galley/export", "routes/api/v1.galley.export.ts"),
	route("api/v1/galley/import", "routes/api/v1.galley.import.ts"),
	route("api/v1/supply/export", "routes/api/v1.supply.export.ts"),

	// API - Meal Plans
	route("api/meal-plans", "routes/api/meal-plans.ts"),
	route("api/meal-plans/:id", "routes/api/meal-plans.$id.ts"),
	route("api/meal-plans/:id/entries", "routes/api/meal-plans.$id.entries.ts"),
	route(
		"api/meal-plans/:id/entries/consume",
		"routes/api/meal-plans.$id.entries.consume.ts",
	),
	route(
		"api/meal-plans/:id/entries/bulk",
		"routes/api/meal-plans.$id.entries.bulk.ts",
	),
	route(
		"api/meal-plans/:id/entries/:entryId",
		"routes/api/meal-plans.$id.entries.$entryId.ts",
	),
	route("api/meal-plans/:id/share", "routes/api/meal-plans.$id.share.ts"),
	route(
		"api/meal-plans/:id/plan-week",
		"routes/api/meal-plans.$id.plan-week.ts",
	),

	// API - Supply Lists
	route("api/supply-lists", "routes/api/supply-lists.ts"),
	route("api/supply-lists/:id", "routes/api/supply-lists.$id.ts"),
	route("api/supply-lists/:id/items", "routes/api/supply-lists.$id.items.ts"),
	route(
		"api/supply-lists/:id/items/:itemId",
		"routes/api/supply-lists.$id.items.$itemId.ts",
	),
	route(
		"api/supply-lists/:id/from-meal",
		"routes/api/supply-lists.$id.from-meal.ts",
	),
	route("api/supply-lists/:id/share", "routes/api/supply-lists.$id.share.ts"),
	route("api/supply-lists/:id/export", "routes/api/supply-lists.$id.export.ts"),
	route(
		"api/supply-lists/:id/complete",
		"routes/api/supply-lists.$id.complete.ts",
	),
	route(
		"api/supply-lists/:id/snoozes",
		"routes/api/supply-lists.$id.snoozes.ts",
	),
	route(
		"api/supply-lists/:id/snoozes/:snoozeId",
		"routes/api/supply-lists.$id.snoozes.$snoozeId.ts",
	),

	// API - Other
	route("api/interest", "routes/api/interest.ts"),
	route("api/scan", "routes/api/scan.tsx"),
	route("api/search", "routes/api/search.ts"),
	route("api/checkout", "routes/api/checkout.tsx"),
	route("api/webhook", "routes/api/webhook.tsx"),
	route("api/billing-portal", "routes/api/billing-portal.ts"),
	route("api/user/purge", "routes/api/user/purge.tsx"),
	route("api/automation/trigger", "routes/api/automation/trigger.ts"),
	route("api/groups/create", "routes/api/groups.create.ts"),
	route("api/groups/delete", "routes/api/groups.delete.ts"),
	route("api/groups/credits/transfer", "routes/api/groups.credits.transfer.ts"),
	route(
		"api/groups/invitations/create",
		"routes/api/groups.invitations.create.ts",
	),
	route("api/api-keys", "routes/api/api-keys.ts"),
	route("api/api-keys/:id", "routes/api/api-keys.$id.ts"),
	route("api/auth/*", "routes/api.auth.$.ts"),

	// Legal
	route("legal", "routes/legal.tsx", [
		route("terms", "routes/legal.terms.tsx"),
		route("privacy", "routes/legal.privacy.tsx"),
	]),
] satisfies RouteConfig;
