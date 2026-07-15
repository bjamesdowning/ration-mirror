/**
 * Smoke-test admin dashboard D1 queries against production ration-db.
 * Run: bun scripts/verify-admin-d1.ts
 */
import { execSync } from "node:child_process";
import { mergeLoggedInUsers } from "../app/lib/admin-users.server";

interface D1ExecuteChunk {
	results: Record<string, unknown>[];
	success: boolean;
}

function d1Remote(sql: string): D1ExecuteChunk[] {
	const out = execSync(
		`bunx wrangler d1 execute ration-db --remote --json --command ${JSON.stringify(sql)}`,
		{ encoding: "utf8", cwd: `${import.meta.dir}/..` },
	);
	return JSON.parse(out) as D1ExecuteChunk[];
}

function assertOk(label: string, chunks: D1ExecuteChunk[]) {
	const chunk = chunks[0];
	if (!chunk?.success) {
		throw new Error(`${label}: D1 query failed`);
	}
	console.log(`✓ ${label} (${chunk.results.length} rows)`);
	return chunk.results;
}

async function main() {
	console.log("Verifying admin D1 queries against prod ration-db...\n");

	// Exact aggregate shape returned by getLoggedInUsers web query
	const webResults = assertOk(
		"web session aggregates",
		d1Remote(
			"SELECT s.user_id, u.name, u.email, COUNT(*) as session_count, MAX(s.updated_at) as last_seen FROM session s INNER JOIN user u ON s.user_id = u.id WHERE s.expires_at > unixepoch() GROUP BY s.user_id, u.name, u.email LIMIT 20",
		),
	);

	const mobileResults = assertOk(
		"mobile token aggregates",
		d1Remote(
			"SELECT m.user_id, u.name, u.email, MAX(m.created_at) as last_seen FROM mobile_refresh_token m INNER JOIN user u ON m.user_id = u.id WHERE m.revoked_at IS NULL AND m.expires_at > unixepoch() GROUP BY m.user_id, u.name, u.email LIMIT 20",
		),
	);

	const webRows = webResults.map((r) => ({
		userId: String(r.user_id),
		name: String(r.name),
		email: String(r.email),
		sessionCount: Number(r.session_count),
		lastSeenAt: r.last_seen as number,
	}));
	const mobileRows = mobileResults.map((r) => ({
		userId: String(r.user_id),
		name: String(r.name),
		email: String(r.email),
		lastSeenAt: r.last_seen as number,
	}));

	// Regression: prod returns unix integers — merge must not call .getTime()
	const merged = mergeLoggedInUsers(webRows, mobileRows, 15);
	console.log(
		`✓ mergeLoggedInUsers: ${merged.length} users (${webRows.length} web + ${mobileRows.length} mobile rows)`,
	);
	if (merged.length > 0 && !(merged[0].lastSeenAt instanceof Date)) {
		throw new Error(
			"mergeLoggedInUsers did not produce Date lastSeenAt values",
		);
	}

	// Usage metrics queries (same SQL patterns as admin-metrics.server.ts)
	assertOk(
		"DAU count",
		d1Remote(
			"SELECT COUNT(*) as count FROM user WHERE COALESCE((SELECT MAX(updated_at) FROM session WHERE user_id = user.id), (SELECT MAX(last_used_at) FROM api_key WHERE user_id = user.id), COALESCE(unixepoch(json_extract(settings, '$.lastActiveAt')), 0), 0) >= unixepoch() - 86400",
		),
	);

	assertOk(
		"activation rate",
		d1Remote(
			"SELECT COUNT(DISTINCT user.id) as total_users, COUNT(DISTINCT CASE WHEN cargo.id IS NOT NULL THEN user.id END) as activated_count FROM user LEFT JOIN member ON member.user_id = user.id LEFT JOIN cargo ON cargo.organization_id = member.organization_id AND cargo.created_at >= user.created_at AND cargo.created_at <= datetime(user.created_at, '+7 days')",
		),
	);

	assertOk(
		"platform split (web sessions)",
		d1Remote(
			"SELECT COUNT(*) as count FROM session WHERE expires_at > unixepoch()",
		),
	);

	assertOk(
		"AI burn 24h",
		d1Remote(
			"SELECT reason, COALESCE(SUM(ABS(amount)), 0) as credits, COUNT(*) as calls FROM ledger WHERE amount < 0 AND created_at > datetime('now', '-1 day') GROUP BY reason LIMIT 10",
		),
	);

	assertOk(
		"admin user list aggregates",
		d1Remote(
			`SELECT u.id, u.name, u.email, u.is_admin, u.created_at,
        MAX(COALESCE(session_agg.session_max_login, 0), COALESCE(mobile_agg.mobile_max_login, 0)) as last_login_unix,
        MAX(
          COALESCE(session_agg.session_max_active, 0),
          COALESCE(api_key_agg.api_key_max_active, 0),
          COALESCE(unixepoch(json_extract(u.settings, '$.lastActiveAt')), 0)
        ) as last_active_unix
      FROM user u
      LEFT JOIN (
        SELECT user_id, MAX(created_at) as session_max_login, MAX(updated_at) as session_max_active
        FROM session GROUP BY user_id
      ) session_agg ON u.id = session_agg.user_id
      LEFT JOIN (
        SELECT user_id, MAX(created_at) as mobile_max_login
        FROM mobile_refresh_token GROUP BY user_id
      ) mobile_agg ON u.id = mobile_agg.user_id
      LEFT JOIN (
        SELECT user_id, MAX(last_used_at) as api_key_max_active
        FROM api_key GROUP BY user_id
      ) api_key_agg ON u.id = api_key_agg.user_id
      ORDER BY u.created_at DESC
      LIMIT 25`,
		),
	);

	console.log("\nAll admin D1 queries verified successfully.");
}

main().catch((err) => {
	console.error("Admin D1 verification failed:", err);
	process.exit(1);
});
