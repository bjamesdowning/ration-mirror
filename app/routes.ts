import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("sign-in", "routes/sign-in.tsx"),

	// Dashboard
	route("dashboard", "routes/dashboard.tsx"), // Defines /dashboard
	route("dashboard/settings", "routes/dashboard/settings.tsx"), // Defines /dashboard/settings

	// Admin
	route("admin", "routes/admin.tsx"),

	// API
	route("api/user/purge", "routes/api/user/purge.tsx"),
] satisfies RouteConfig;
