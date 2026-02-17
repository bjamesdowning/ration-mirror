import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("invitations/accept", "routes/invitations.accept.tsx"),
	route("select-group", "routes/select-group.tsx"),

	// Dashboard
	route("dashboard", "routes/dashboard.tsx", [
		index("routes/dashboard/index.tsx"),
		route("settings", "routes/dashboard/settings.tsx"),
		route("pricing", "routes/dashboard/pricing.tsx"),

		// Pantry/Inventory
		route("pantry", "routes/dashboard/pantry.tsx"),

		// Meals
		route("meals", "routes/dashboard/meals.tsx"),
		route("meals/new", "routes/dashboard/meals.new.tsx"),
		route("meals/:id", "routes/dashboard/meals.$id.tsx"),
		route("meals/:id/edit", "routes/dashboard/meals.$id.edit.tsx"),

		// Groups
		route("groups/new", "routes/dashboard/groups.new.tsx"),

		// Grocery Lists
		route("grocery", "routes/dashboard/grocery.tsx"),
	]),

	// Admin
	route("admin", "routes/admin.tsx"),

	// Shared (public) routes
	route("shared/:token", "routes/shared.$token.tsx"),

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
	route("api/recipes/import", "routes/api/recipes.import.ts"),

	// API - Inventory
	route("api/inventory/:id", "routes/api/inventory.$id.ts"),
	route("api/inventory/batch", "routes/api/inventory.batch.tsx"),

	// API - Grocery Lists
	route("api/grocery-lists", "routes/api/grocery-lists.ts"),
	route("api/grocery-lists/:id", "routes/api/grocery-lists.$id.ts"),
	route("api/grocery-lists/:id/items", "routes/api/grocery-lists.$id.items.ts"),
	route(
		"api/grocery-lists/:id/items/:itemId",
		"routes/api/grocery-lists.$id.items.$itemId.ts",
	),
	route(
		"api/grocery-lists/:id/from-meal",
		"routes/api/grocery-lists.$id.from-meal.ts",
	),
	route("api/grocery-lists/:id/share", "routes/api/grocery-lists.$id.share.ts"),
	route(
		"api/grocery-lists/:id/export",
		"routes/api/grocery-lists.$id.export.ts",
	),
	route(
		"api/grocery-lists/:id/complete",
		"routes/api/grocery-lists.$id.complete.ts",
	),

	// API - Other
	route("api/scan", "routes/api/scan.tsx"),
	route("api/search", "routes/api/search.ts"),
	route("api/checkout", "routes/api/checkout.tsx"),
	route("api/webhook", "routes/api/webhook.tsx"),
	route("api/billing-portal", "routes/api/billing-portal.ts"),
	route("api/user/purge", "routes/api/user/purge.tsx"),
	route("api/automation/trigger", "routes/api/automation/trigger.ts"),
	route("api/groups/create", "routes/api/groups.create.ts"),
	route("api/groups/delete", "routes/api/groups.delete.ts"),
	route(
		"api/groups/invitations/create",
		"routes/api/groups.invitations.create.ts",
	),
	route("api/auth/*", "routes/api.auth.$.ts"),

	// Legal
	route("legal", "routes/legal.tsx", [
		route("terms", "routes/legal.terms.tsx"),
		route("privacy", "routes/legal.privacy.tsx"),
	]),
] satisfies RouteConfig;
