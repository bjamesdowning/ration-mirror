/**
 * Safe postinstall: skip cf-typegen when node_modules is incomplete so
 * `bun install` can finish; run wrangler types when dependencies are present.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	type CriticalCfTypegenDepPath,
	findMissingCfTypegenDeps,
	formatPostinstallRecoveryMessage,
} from "../app/lib/verify-test-deps";

const root = join(import.meta.dirname, "..");

const missing = findMissingCfTypegenDeps(
	(relativePath: CriticalCfTypegenDepPath) =>
		existsSync(join(root, relativePath)),
);

if (missing.length > 0) {
	console.warn(formatPostinstallRecoveryMessage(missing));
	console.warn(
		"[postinstall] Skipping cf-typegen so install can complete. Re-run after recovery.",
	);
	process.exit(0);
}

const typegen = spawnSync("bun", ["run", "cf-typegen"], {
	cwd: root,
	stdio: "inherit",
});

process.exit(typegen.status ?? 1);
