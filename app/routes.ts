import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	route("robots.txt", "routes/robots-txt.ts"),
	route("sitemap.xml", "routes/sitemap.xml.ts"),
	route("llms.txt", "routes/llms-txt.ts"),
	route("llms-full.txt", "routes/llms-full-txt.ts"),
	route(".well-known/api-catalog", "routes/well-known.api-catalog.ts"),
	route(
		".well-known/oauth-protected-resource",
		"routes/well-known.oauth-protected-resource.ts",
	),
	route(
		".well-known/oauth-authorization-server",
		"routes/well-known.oauth-authorization-server.ts",
	),
	route(
		".well-known/oauth-authorization-server/api/auth",
		"routes/well-known.oauth-authorization-server.api-auth.ts",
	),
	route(
		".well-known/openid-configuration",
		"routes/well-known.openid-configuration.ts",
	),
	route(
		".well-known/openid-configuration/api/auth",
		"routes/well-known.openid-configuration.api-auth.ts",
	),
	route(
		".well-known/mcp/server-card.json",
		"routes/well-known.mcp.server-card.ts",
	),
	route(
		".well-known/apple-app-site-association",
		"routes/well-known.apple-app-site-association.ts",
	),
	route(
		".well-known/agent-skills/index.json",
		"routes/well-known.agent-skills.index.ts",
	),
	route(
		".well-known/agent-skills/:skillName/SKILL.md",
		"routes/well-known.agent-skills.$skillName.SKILL.ts",
	),
	route("auth.md", "routes/auth-md.ts"),
	route("mcp.md", "routes/mcp-md.ts"),
	route("connect", "routes/connect.tsx"),
	route("connect/claim", "routes/connect.claim.tsx"),
	index("routes/home.tsx"),
	route("docs/api", "routes/docs.api.tsx"),
	route("invitations/accept", "routes/invitations.accept.tsx"),
	route("select-group", "routes/select-group.tsx"),
	route("auth/verify", "routes/auth.verify.tsx"),
	route("auth/magic-link/continue", "routes/auth.magic-link.continue.tsx"),
	route("auth/mobile-callback", "routes/auth.mobile-callback.tsx"),
	route("auth/mobile-callback/open", "routes/auth.mobile-callback.open.tsx"),
	route("oauth/sign-in", "routes/oauth.sign-in.tsx"),
	route("oauth/consent", "routes/oauth.consent.tsx"),
	route("oauth/select-org", "routes/oauth.select-org.tsx"),
	route("oauth/return", "routes/oauth.return.tsx"),

	// Hub
	route("hub", "routes/hub.tsx", [
		index("routes/hub/index.tsx"),
		route("settings", "routes/hub/settings.tsx"),
		route("checkout/return", "routes/hub/checkout.return.tsx"),
		route("pricing", "routes/hub/pricing.tsx"),

		// Cargo
		route("cargo", "routes/hub/cargo.tsx"),
		route("cargo/:id", "routes/hub/cargo.$id.tsx"),

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

	// About
	route("about", "routes/about.tsx"),

	// Blog
	route("blog", "routes/blog.tsx"),
	route("blog/rss.xml", "routes/blog.rss.xml.ts"),
	route("blog/:slug", "routes/blog.$slug.tsx"),

	// Shared (public) routes
	route("shared/:token", "routes/shared.$token.tsx"),
	route("shared/manifest/:token", "routes/shared.manifest.$token.tsx"),

	// API - Admin
	route("api/admin/users", "routes/api/admin.users.ts"),
	route(
		"api/shared/:token/items/:itemId",
		"routes/api/shared.$token.items.$itemId.ts",
	),
	route("api/shared/:token/items", "routes/api/shared.$token.items.ts"),

	// API - Meals
	route("api/meals", "routes/api/meals.ts"),
	route("api/meals/match", "routes/api/meals.match.ts"),
	route("api/meals/:id", "routes/api/meals.$id.ts"),
	route("api/meals/:id/cook", "routes/api/meals.$id.cook.ts"),
	route(
		"api/meals/generate/status/:requestId",
		"routes/api/meals.generate.status.$requestId.ts",
	),
	route("api/meals/generate", "routes/api/meals.generate.ts"),
	route("api/meals/clear-selections", "routes/api/meals.clear-selections.ts"),
	route("api/meals/:id/toggle-active", "routes/api/meals.$id.toggle-active.ts"),
	route("api/meals/import", "routes/api/meals.import.ts"),
	route("api/meals/import/confirm", "routes/api/meals.import.confirm.ts"),
	route(
		"api/meals/import/status/:requestId",
		"routes/api/meals.import.status.$requestId.ts",
	),

	// API - Provisions (single-item meals)
	route("api/provisions", "routes/api/provisions.ts"),
	route("api/provisions/:id", "routes/api/provisions.$id.ts"),

	// API - Tag registry
	route("api/tags", "routes/api/tags.ts"),
	route("api/tags/:id/merge", "routes/api/tags.$id.merge.ts"),
	route("api/tags/:id", "routes/api/tags.$id.ts"),

	// API - Cargo (static paths before :id)
	route("api/cargo", "routes/api/cargo.ts"),
	route("api/cargo/export", "routes/api/cargo.export.ts"),
	route("api/cargo/batch", "routes/api/cargo.batch.tsx"),
	route("api/cargo/clear-selections", "routes/api/cargo.clear-selections.ts"),

	// API - Galley
	route("api/galley/export", "routes/api/galley.export.ts"),
	route("api/galley/import", "routes/api/galley.import.ts"),
	route("api/cargo/:id", "routes/api/cargo.$id.ts"),
	route(
		"api/cargo/:id/toggle-restock",
		"routes/api/cargo.$id.toggle-restock.ts",
	),

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
	route(
		"api/meal-plans/:id/plan-week/status/:requestId",
		"routes/api/meal-plans.$id.plan-week.status.$requestId.ts",
	),
	route(
		"api/meal-plans/supply-days/:date",
		"routes/api/meal-plans.supply-days.$date.ts",
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
		"api/supply-lists/:id/scan-match",
		"routes/api/supply-lists.$id.scan-match.ts",
	),
	route(
		"api/supply-lists/:id/scan-complete",
		"routes/api/supply-lists.$id.scan-complete.ts",
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
	route("api/scan/status/:requestId", "routes/api/scan.status.$requestId.ts"),
	route("api/scan", "routes/api/scan.tsx"),
	route("api/search", "routes/api/search.ts"),
	route("api/copilot/status", "routes/api/copilot.status.ts"),
	route("api/copilot/consent", "routes/api/copilot.consent.ts"),
	route("api/copilot/token", "routes/api/copilot.token.ts"),
	route("api/checkout", "routes/api/checkout.tsx"),
	route("api/webhook", "routes/api/webhook.tsx"),
	route("api/webhook/revenuecat", "routes/api/webhook.revenuecat.tsx"),
	route("api/billing-portal", "routes/api/billing-portal.ts"),
	route("api/user/avatar", "routes/api/user/avatar.tsx"),
	route("api/user/avatar/:userId", "routes/api/user/avatar.$userId.tsx"),
	route("api/organization/avatar", "routes/api/organization/avatar.tsx"),
	route(
		"api/organization/supply-settings",
		"routes/api/organization.supply-settings.ts",
	),
	route(
		"api/organization/avatar/:orgId",
		"routes/api/organization/avatar.$orgId.tsx",
	),
	route("api/user/purge", "routes/api/user/purge.tsx"),
	route("api/openapi.json", "routes/api.openapi.ts"),
	route("api/status", "routes/api.status.ts"),
	route("api/automation/trigger", "routes/api/automation/trigger.ts"),
	route("api/groups/create", "routes/api/groups.create.ts"),
	route("api/groups/delete", "routes/api/groups.delete.ts"),
	route("api/groups/credits/transfer", "routes/api/groups.credits.transfer.ts"),
	route(
		"api/groups/ownership/transfer",
		"routes/api/groups.ownership.transfer.ts",
	),
	route(
		"api/groups/invitations/create",
		"routes/api/groups.invitations.create.ts",
	),
	route(
		"api/groups/members/:memberId/role",
		"routes/api/groups.members.$memberId.role.ts",
	),
	route("api/api-keys", "routes/api/api-keys.ts"),
	route("api/api-keys/:id", "routes/api/api-keys.$id.ts"),
	route("api/agent/auth", "routes/api/agent/auth.ts"),
	route("api/agent/auth/claim", "routes/api/agent/auth.claim.ts"),
	route(
		"api/agent/auth/claim/complete",
		"routes/api/agent/auth.claim.complete.ts",
	),
	route(
		"api/agent/auth/claim/reissue",
		"routes/api/agent/auth.claim.reissue.ts",
	),
	route("api/oauth/grants", "routes/api.oauth.grants.ts"),
	route("api/openapi/mobile-v1.json", "routes/api/openapi.mobile-v1.ts"),

	// Mobile API v1 (Bearer JWT — iOS app)
	route(
		"api/mobile/v1/auth/magic-link",
		"routes/api/mobile/v1.auth.magic-link.ts",
	),
	route("api/mobile/v1/auth/social", "routes/api/mobile/v1.auth.social.ts"),
	route("api/mobile/v1/auth/token", "routes/api/mobile/v1.auth.token.ts"),
	route("api/mobile/v1/auth/session", "routes/api/mobile/v1.auth.session.ts"),
	route("api/mobile/v1/session", "routes/api/mobile/v1.session.ts"),
	route("api/mobile/v1/orgs", "routes/api/mobile/v1.orgs.ts"),
	route(
		"api/mobile/v1/groups/credits/transfer",
		"routes/api/mobile/v1.groups.credits.transfer.ts",
	),
	route("api/mobile/v1/groups", "routes/api/mobile/v1.groups.ts"),
	route("api/mobile/v1/groups/delete", "routes/api/mobile/v1.groups.delete.ts"),
	route(
		"api/mobile/v1/groups/members",
		"routes/api/mobile/v1.groups.members.ts",
	),
	route(
		"api/mobile/v1/groups/invitations/create",
		"routes/api/mobile/v1.groups.invitations.create.ts",
	),
	route(
		"api/mobile/v1/groups/members/:memberId/role",
		"routes/api/mobile/v1.groups.members.$memberId.role.ts",
	),
	route(
		"api/mobile/v1/groups/ownership/transfer",
		"routes/api/mobile/v1.groups.ownership.transfer.ts",
	),
	route("api/mobile/v1/undo", "routes/api/mobile/v1.undo.ts"),
	route(
		"api/mobile/v1/orgs/:id/activate",
		"routes/api/mobile/v1.orgs.$id.activate.ts",
	),
	route("api/mobile/v1/hub", "routes/api/mobile/v1.hub.ts"),
	route("api/mobile/v1/settings", "routes/api/mobile/v1.settings.ts"),
	route("api/mobile/v1/tags", "routes/api/mobile/v1.tags.ts"),
	route(
		"api/mobile/v1/tags/:id/merge",
		"routes/api/mobile/v1.tags.$id.merge.ts",
	),
	route("api/mobile/v1/tags/:id", "routes/api/mobile/v1.tags.$id.ts"),
	route("api/mobile/v1/user/avatar", "routes/api/mobile/v1.user.avatar.ts"),
	route(
		"api/mobile/v1/organization/avatar",
		"routes/api/mobile/v1.organization.avatar.ts",
	),
	route(
		"api/mobile/v1/organization/supply-settings",
		"routes/api/mobile/v1.organization.supply-settings.ts",
	),
	route("api/mobile/v1/cargo", "routes/api/mobile/v1.cargo.ts"),
	route("api/mobile/v1/cargo/batch", "routes/api/mobile/v1.cargo.batch.ts"),
	route("api/mobile/v1/cargo/tags", "routes/api/mobile/v1.cargo.tags.ts"),
	route(
		"api/mobile/v1/cargo/tag-index",
		"routes/api/mobile/v1.cargo.tag-index.ts",
	),
	route(
		"api/mobile/v1/cargo/clear-selections",
		"routes/api/mobile/v1.cargo.clear-selections.ts",
	),
	route("api/mobile/v1/cargo/:id", "routes/api/mobile/v1.cargo.$id.ts"),
	route(
		"api/mobile/v1/cargo/:id/toggle-restock",
		"routes/api/mobile/v1.cargo.$id.toggle-restock.ts",
	),
	route("api/mobile/v1/scan", "routes/api/mobile/v1.scan.ts"),
	route(
		"api/mobile/v1/scan/:requestId",
		"routes/api/mobile/v1.scan.$requestId.ts",
	),
	route("api/mobile/v1/meals", "routes/api/mobile/v1.meals.ts"),
	route(
		"api/mobile/v1/meals/clear-selections",
		"routes/api/mobile/v1.meals.clear-selections.ts",
	),
	route("api/mobile/v1/provisions", "routes/api/mobile/v1.provisions.ts"),
	route("api/mobile/v1/meals/match", "routes/api/mobile/v1.meals.match.ts"),
	route("api/mobile/v1/meals/tags", "routes/api/mobile/v1.meals.tags.ts"),
	route(
		"api/mobile/v1/meals/generate",
		"routes/api/mobile/v1.meals.generate.ts",
	),
	route(
		"api/mobile/v1/meals/generate/:requestId",
		"routes/api/mobile/v1.meals.generate.$requestId.ts",
	),
	route("api/mobile/v1/meals/import", "routes/api/mobile/v1.meals.import.ts"),
	route(
		"api/mobile/v1/meals/import/:requestId",
		"routes/api/mobile/v1.meals.import.$requestId.ts",
	),
	route(
		"api/mobile/v1/meals/import/confirm",
		"routes/api/mobile/v1.meals.import.confirm.ts",
	),
	route("api/mobile/v1/meals/:id", "routes/api/mobile/v1.meals.$id.ts"),
	route("api/mobile/v1/supply", "routes/api/mobile/v1.supply.ts"),
	route("api/mobile/v1/supply/items", "routes/api/mobile/v1.supply.items.ts"),
	route(
		"api/mobile/v1/supply/items/:id",
		"routes/api/mobile/v1.supply.items.$id.ts",
	),
	route(
		"api/mobile/v1/supply/snoozes",
		"routes/api/mobile/v1.supply.snoozes.ts",
	),
	route(
		"api/mobile/v1/supply/snoozes/:snoozeId",
		"routes/api/mobile/v1.supply.snoozes.$snoozeId.ts",
	),
	route("api/mobile/v1/search", "routes/api/mobile/v1.search.ts"),
	route(
		"api/mobile/v1/copilot/status",
		"routes/api/mobile/v1.copilot.status.ts",
	),
	route(
		"api/mobile/v1/copilot/consent",
		"routes/api/mobile/v1.copilot.consent.ts",
	),
	route(
		"api/mobile/v1/billing/status",
		"routes/api/mobile/v1.billing.status.ts",
	),
	route("api/mobile/v1/account", "routes/api/mobile/v1.account.ts"),
	route("api/mobile/v1/manifest", "routes/api/mobile/v1.manifest.ts"),
	route(
		"api/mobile/v1/manifest/consume",
		"routes/api/mobile/v1.manifest.consume.ts",
	),
	route(
		"api/mobile/v1/manifest/plan-week",
		"routes/api/mobile/v1.manifest.plan-week.ts",
	),
	route(
		"api/mobile/v1/manifest/plan-week/:requestId",
		"routes/api/mobile/v1.manifest.plan-week.$requestId.ts",
	),
	route("api/mobile/v1/manifest/bulk", "routes/api/mobile/v1.manifest.bulk.ts"),
	route(
		"api/mobile/v1/manifest/entries/:entryId",
		"routes/api/mobile/v1.manifest.entries.$entryId.ts",
	),
	route(
		"api/mobile/v1/manifest/share",
		"routes/api/mobile/v1.manifest.share.ts",
	),
	route(
		"api/mobile/v1/manifest/supply-days/:date",
		"routes/api/mobile/v1.manifest.supply-days.$date.ts",
	),
	route(
		"api/mobile/v1/meals/:id/cook",
		"routes/api/mobile/v1.meals.$id.cook.ts",
	),
	route(
		"api/mobile/v1/meals/:id/toggle-active",
		"routes/api/mobile/v1.meals.$id.toggle-active.ts",
	),
	route("api/mobile/v1/supply/sync", "routes/api/mobile/v1.supply.sync.ts"),
	route(
		"api/mobile/v1/supply/complete",
		"routes/api/mobile/v1.supply.complete.ts",
	),
	route("api/mobile/v1/supply/scan", "routes/api/mobile/v1.supply.scan.ts"),
	route("api/mobile/v1/supply/share", "routes/api/mobile/v1.supply.share.ts"),

	route("api/auth/*", "routes/api.auth.$.ts"),

	// Tools (public, no auth)
	route("tools", "routes/tools.tsx"),
	route("tools/unit-converter", "routes/tools.unit-converter.tsx"),

	// Legal
	route("legal", "routes/legal.tsx", [
		route("terms", "routes/legal.terms.tsx"),
		route("privacy", "routes/legal.privacy.tsx"),
	]),
] satisfies RouteConfig;
