#!/usr/bin/env bun
/**
 * Seed the ration-nutrition D1 database (schema + minimal USDA-shaped foods).
 *
 * Local (Miniflare / wrangler local D1):
 *   bun run db:nutrition:seed:local
 *
 * Or manually:
 *   bunx wrangler d1 execute ration-nutrition --local --file=nutrition-db/schema.sql
 *   bunx wrangler d1 execute ration-nutrition --local --file=nutrition-db/seed-minimal.sql
 *
 * Remote production:
 *   bunx wrangler d1 execute ration-nutrition --remote --file=nutrition-db/schema.sql
 *   bunx wrangler d1 execute ration-nutrition --remote --file=nutrition-db/seed-minimal.sql
 *
 * Remote dev env DB:
 *   bunx wrangler d1 execute ration-nutrition-dev --remote --file=nutrition-db/schema.sql
 *   bunx wrangler d1 execute ration-nutrition-dev --remote --file=nutrition-db/seed-minimal.sql
 *
 * Pass --execute to shell out the local seed commands from this script.
 */
import { $ } from "bun";

const SCHEMA = "nutrition-db/schema.sql";
const SEED = "nutrition-db/seed-minimal.sql";
const LOCAL_DB = "ration-nutrition";

function printHelp(): void {
	console.log(`ration-nutrition seed helper

Usage:
  bun scripts/seed-nutrition-db.ts           # print commands
  bun scripts/seed-nutrition-db.ts --execute # run local seed via wrangler
  bun run db:nutrition:seed:local            # package.json shortcut (local)

Databases:
  production: ration-nutrition      (binding NUTRITION_DB)
  development: ration-nutrition-dev (binding NUTRITION_DB, env.dev)

Files:
  ${SCHEMA}
  ${SEED}
`);
}

async function executeLocal(): Promise<void> {
	console.log(`Seeding local D1 "${LOCAL_DB}"…`);
	await $`bunx wrangler d1 execute ${LOCAL_DB} --local --file=${SCHEMA}`;
	await $`bunx wrangler d1 execute ${LOCAL_DB} --local --file=${SEED}`;
	console.log("Local nutrition DB seed complete.");
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
	printHelp();
	process.exit(0);
}

if (args.includes("--execute")) {
	await executeLocal();
} else {
	printHelp();
	console.log("Suggested local commands:\n");
	console.log(
		`  bunx wrangler d1 execute ${LOCAL_DB} --local --file=${SCHEMA}`,
	);
	console.log(`  bunx wrangler d1 execute ${LOCAL_DB} --local --file=${SEED}`);
}
