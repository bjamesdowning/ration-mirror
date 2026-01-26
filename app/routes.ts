import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("sign-in", "routes/sign-in.tsx"),
	route("sign-up", "routes/sign-up.tsx"),

	// Dashboard
	route("dashboard", "routes/dashboard.tsx", [
		index("routes/dashboard/index.tsx"),
		route("settings", "routes/dashboard/settings.tsx"),
		route("credits", "routes/dashboard/credits.tsx"),

		// Meals
		route("meals", "routes/dashboard/meals.tsx"),
		route("meals/new", "routes/dashboard/meals.new.tsx"),
		route("meals/:id", "routes/dashboard/meals.$id.tsx"),
		route("meals/:id/edit", "routes/dashboard/meals.$id.edit.tsx"),

		// Grocery Lists
		route("grocery", "routes/dashboard/grocery.tsx"),
	]),

	// Admin
	route("admin", "routes/admin.tsx"),

	// Shared (public) routes
	route("shared/:token", "routes/shared.$token.tsx"),

	// API - Meals
	route("api/meals", "routes/api/meals.ts"),
	route("api/meals/match", "routes/api/meals.match.ts"),
	route("api/meals/:id", "routes/api/meals.$id.ts"),
	route("api/meals/:id/cook", "routes/api/meals.$id.cook.ts"),

	// API - Inventory
	route("api/inventory/:id", "routes/api/inventory.$id.ts"),

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

	// API - Other
	route("api/scan", "routes/api/scan.tsx"),
	route("api/search", "routes/api/search.tsx"),
	route("api/checkout", "routes/api/checkout.tsx"),
	route("api/webhook", "routes/api/webhook.tsx"),
	route("api/user/purge", "routes/api/user/purge.tsx"),
	route("api/auth/*", "routes/api.auth.$.ts"),

	// Legal
	route("legal", "routes/legal.tsx", [
		route("terms", "routes/legal.terms.tsx"),
		route("privacy", "routes/legal.privacy.tsx"),
	]),
] satisfies RouteConfig;
