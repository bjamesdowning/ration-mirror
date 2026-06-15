/** iCloud local-dev symlink target name (relative to project root). */
export const NODE_MODULES_NOSYNC = "node_modules.nosync";

export type EnsureDepsLayout = {
	hasNosyncStore: boolean;
	hasNodeModules: boolean;
	isSymlink: boolean;
	symlinkTarget: string | null;
};

export type EnsureDepsAction = "noop" | "restore_symlink" | "fail_no_install";

/** Returns root entries matching iCloud-renamed stray symlinks (e.g. "node_modules 2"). */
export function findIcloudStraySymlinks(entries: string[]): string[] {
	return entries.filter((entry) => /^node_modules \d+$/.test(entry));
}

/**
 * Decides how ensure-deps should behave for the current node_modules layout.
 * Standard installs (real node_modules, no nosync store) are a no-op.
 */
export function resolveEnsureDepsAction(
	layout: EnsureDepsLayout,
): EnsureDepsAction {
	if (!layout.hasNosyncStore) {
		if (layout.hasNodeModules) {
			return "noop";
		}
		return "fail_no_install";
	}

	const linkOk =
		layout.hasNodeModules &&
		layout.isSymlink &&
		layout.symlinkTarget === NODE_MODULES_NOSYNC;

	return linkOk ? "noop" : "restore_symlink";
}
