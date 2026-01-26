import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("sign-in", "routes/sign-in.tsx"),
	route("sign-up", "routes/sign-up.tsx"),

	// Dashboard
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
	]),

	// Admin
	route("admin", "routes/admin.tsx"),

	// API
	route("api/meals", "routes/api/meals.ts"),
	route("api/meals/match", "routes/api/meals.match.ts"),
	route("api/meals/:id", "routes/api/meals.$id.ts"),
	route("api/meals/:id/cook", "routes/api/meals.$id.cook.ts"),
	route("api/inventory/:id", "routes/api/inventory.$id.ts"),
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
