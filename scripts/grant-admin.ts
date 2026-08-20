/**
 * Grant or revoke `user.is_admin` on remote production D1.
 *
 * Usage:
 *   bun scripts/grant-admin.ts bjamesdowning+test01@gmail.com
 *   bun scripts/grant-admin.ts user@example.com --revoke
 */
import { execSync } from "node:child_process";

interface D1ExecuteChunk {
	results: Record<string, unknown>[];
	success: boolean;
}

function sqlString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function d1Remote(sql: string): D1ExecuteChunk[] {
	const out = execSync(
		`bunx wrangler d1 execute ration-db --remote --json --command ${JSON.stringify(sql)}`,
		{ encoding: "utf8", cwd: `${import.meta.dir}/..` },
	);
	return JSON.parse(out) as D1ExecuteChunk[];
}

function main() {
	const args = process.argv.slice(2).filter((arg) => arg !== "--");
	const revoke = args.includes("--revoke");
	const email = args.find((arg) => arg !== "--revoke");
	if (!email?.includes("@")) {
		console.error("Usage: bun scripts/grant-admin.ts <email> [--revoke]");
		process.exit(1);
	}

	const lookup = d1Remote(
		`SELECT id, email, is_admin FROM user WHERE email = ${sqlString(email)} LIMIT 1`,
	);
	const row = lookup[0]?.results[0];
	if (!lookup[0]?.success || !row) {
		console.error(`No user found with email ${email}`);
		process.exit(1);
	}

	const nextAdmin = revoke ? 0 : 1;
	const updated = d1Remote(
		`UPDATE user SET is_admin = ${nextAdmin}, updated_at = unixepoch() WHERE email = ${sqlString(email)}`,
	);
	if (!updated[0]?.success) {
		console.error("Failed to update is_admin");
		process.exit(1);
	}

	console.log(
		`${revoke ? "Revoked" : "Granted"} admin for ${email} (id ${String(row.id)})`,
	);
}

main();
