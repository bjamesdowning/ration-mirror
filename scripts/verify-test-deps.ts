/**
 * Preflight for `bun run test:unit` — fail fast with recovery steps when
 * Vitest/Vite dependencies are missing (corrupted or incomplete node_modules).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	type CriticalTestDepPath,
	findMissingTestDeps,
	formatTestDepsRecoveryMessage,
} from "../app/lib/verify-test-deps";

const root = join(import.meta.dirname, "..");

const missing = findMissingTestDeps((relativePath: CriticalTestDepPath) =>
	existsSync(join(root, relativePath)),
);

if (missing.length > 0) {
	console.error(formatTestDepsRecoveryMessage(missing));
	process.exit(1);
}
