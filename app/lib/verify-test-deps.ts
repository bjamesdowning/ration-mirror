/** Relative paths Vitest/Vite need before `vitest run` can start. */
export const CRITICAL_TEST_DEP_PATHS = [
	"node_modules/esbuild/lib/main.js",
	"node_modules/obug/dist/node.js",
	"node_modules/vite/package.json",
] as const;

/** Relative paths Wrangler needs before `wrangler types` (cf-typegen) can run. */
export const CRITICAL_CF_TYPEGEN_DEP_PATHS = [
	"node_modules/undici/lib/dispatcher/client.js",
	"node_modules/wrangler/wrangler-dist/cli.js",
] as const;

export type CriticalTestDepPath = (typeof CRITICAL_TEST_DEP_PATHS)[number];
export type CriticalCfTypegenDepPath =
	(typeof CRITICAL_CF_TYPEGEN_DEP_PATHS)[number];

export function findMissingTestDeps(
	exists: (relativePath: CriticalTestDepPath) => boolean,
): CriticalTestDepPath[] {
	return CRITICAL_TEST_DEP_PATHS.filter((path) => !exists(path));
}

export function findMissingCfTypegenDeps(
	exists: (relativePath: CriticalCfTypegenDepPath) => boolean,
): CriticalCfTypegenDepPath[] {
	return CRITICAL_CF_TYPEGEN_DEP_PATHS.filter((path) => !exists(path));
}

function formatDepsRecoveryMessage(
	label: string,
	missing: readonly string[],
): string {
	const lines = [
		`${label} Missing or incomplete dependency files:`,
		...missing.map((path) => `  - ${path}`),
		"",
		"This usually means node_modules is corrupted or incomplete.",
		"",
		"Recovery:",
		"  rm -rf node_modules",
		"  bun install --ignore-scripts",
		"  bun run cf-typegen",
		"  bun run test:unit",
		"",
		"Use --ignore-scripts when postinstall (cf-typegen) fails on a broken tree.",
		"After a clean install, run `bun run cf-typegen` once if you need fresh Worker types.",
	];
	return lines.join("\n");
}

export function formatTestDepsRecoveryMessage(
	missing: readonly string[],
): string {
	return formatDepsRecoveryMessage("[verify-test-deps]", missing);
}

export function formatPostinstallRecoveryMessage(
	missing: readonly string[],
): string {
	return formatDepsRecoveryMessage("[postinstall]", missing);
}
