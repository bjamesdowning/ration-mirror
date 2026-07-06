/**
 * Exact `.well-known/*` paths registered in `app/routes.ts`.
 * The Worker pre-router gate must allow these through to React Router.
 *
 * Dynamic segments (e.g. agent-skills/:skillName) are covered by prefix rules
 * in `isRegisteredWellKnownPath`.
 */
export const WELL_KNOWN_ALLOW_EXACT = [
	"/.well-known/api-catalog",
	"/.well-known/oauth-protected-resource",
	"/.well-known/oauth-authorization-server",
	"/.well-known/oauth-authorization-server/api/auth",
	"/.well-known/openid-configuration",
	"/.well-known/openid-configuration/api/auth",
	"/.well-known/mcp/server-card.json",
	"/.well-known/apple-app-site-association",
	"/.well-known/agent-skills/index.json",
] as const;

const WELL_KNOWN_ALLOW_EXACT_SET = new Set<string>(WELL_KNOWN_ALLOW_EXACT);

/** Prefix for parameterized agent-skills routes in `app/routes.ts`. */
export const WELL_KNOWN_AGENT_SKILLS_PREFIX = "/.well-known/agent-skills/";

export function isRegisteredWellKnownPath(pathname: string): boolean {
	if (WELL_KNOWN_ALLOW_EXACT_SET.has(pathname)) return true;
	if (pathname.startsWith(WELL_KNOWN_AGENT_SKILLS_PREFIX)) return true;
	return false;
}
