export type FlagRegistryEntry = {
	defaultEnabled: boolean;
	description: string;
	/** When true, exposed via root loader `clientFlags` (camelCase `clientKey` or flag key). */
	clientVisible?: boolean;
	/** camelCase key for React loaders; defaults to flag key with hyphens removed. */
	clientKey?: string;
};

/** Add entries when gating a feature. Keys must match Flagship dashboard (kebab-case). */
export const FLAG_REGISTRY: Record<string, FlagRegistryEntry> = {
	"apple-web-login": {
		defaultEnabled: false,
		description: "Sign in with Apple on web",
		clientVisible: true,
		clientKey: "appleWebLogin",
	},
	"ration-copilot": {
		defaultEnabled: false,
		description: "Native Ration Copilot chat on web and iOS",
		clientVisible: true,
		clientKey: "rationCopilot",
	},
};

/** Registry keys — narrows as entries are added to FLAG_REGISTRY. */
export type FlagKey = keyof typeof FLAG_REGISTRY & string;

const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isValidFlagKey(key: string): boolean {
	return KEBAB_CASE.test(key);
}

export function assertRegistryDefaults(): void {
	for (const [key, entry] of Object.entries(FLAG_REGISTRY)) {
		if (!isValidFlagKey(key)) {
			throw new Error(`Invalid flag key "${key}": use kebab-case`);
		}
		if (entry.defaultEnabled !== false) {
			throw new Error(
				`Flag "${key}" must have defaultEnabled: false for safe rollout`,
			);
		}
	}
}

export function getClientFlagKey(
	flag: string,
	entry: FlagRegistryEntry,
): string {
	if (entry.clientKey) return entry.clientKey;
	return flag.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
