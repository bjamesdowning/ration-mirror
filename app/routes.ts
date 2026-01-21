import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("sign-in", "routes/sign-in.tsx"),
	route("sign-up", "routes/sign-up.tsx"),

	// Dashboard
	route("dashboard", "routes/dashboard.tsx"), // Defines /dashboard
	route("dashboard/settings", "routes/dashboard/settings.tsx"), // Defines /dashboard/settings
	route("dashboard/credits", "routes/dashboard/credits.tsx"), // Defines /dashboard/credits

	// Admin
	route("admin", "routes/admin.tsx"),

	// API
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
