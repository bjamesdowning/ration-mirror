#!/usr/bin/env bun
/**
 * Validates FLAG_REGISTRY conventions before committing flag-gated features.
 * Run: bun run flag:check
 */
import { assertRegistryDefaults } from "../app/lib/feature-flags/registry";

function main(): void {
	try {
		assertRegistryDefaults();
		console.log("flag:check OK — registry keys and defaults are valid");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`flag:check failed: ${message}`);
		process.exit(1);
	}
}

main();
