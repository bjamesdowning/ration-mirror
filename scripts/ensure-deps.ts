/**
 * Ensures `node_modules` is a symlink to `node_modules.nosync`.
 * iCloud Drive can rename conflicting symlinks (e.g. "node_modules 2"), which
 * breaks bun scripts that expect `node_modules/.bin/*` on PATH.
 *
 * No-op on standard installs (CI, Cloudflare Builds, non-iCloud dev).
 */
import {
	existsSync,
	lstatSync,
	readdirSync,
	readlinkSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { join } from "node:path";
import {
	findIcloudStraySymlinks,
	NODE_MODULES_NOSYNC,
	resolveEnsureDepsAction,
} from "../app/lib/ensure-deps";

const root = join(import.meta.dirname, "..");
const target = join(root, NODE_MODULES_NOSYNC);
const link = join(root, "node_modules");

for (const entry of findIcloudStraySymlinks(readdirSync(root))) {
	const strayPath = join(root, entry);
	if (lstatSync(strayPath).isSymbolicLink()) {
		rmSync(strayPath);
	}
}

const hasNodeModules = existsSync(link);
let isSymlink = false;
let symlinkTarget: string | null = null;
if (hasNodeModules) {
	isSymlink = lstatSync(link).isSymbolicLink();
	if (isSymlink) {
		symlinkTarget = readlinkSync(link);
	}
}

const action = resolveEnsureDepsAction({
	hasNosyncStore: existsSync(target),
	hasNodeModules,
	isSymlink,
	symlinkTarget,
});

if (action === "fail_no_install") {
	console.error(
		"[ensure-deps] No node_modules found — run `bun install` first.",
	);
	process.exit(1);
}

if (action === "restore_symlink") {
	if (existsSync(link)) {
		rmSync(link, { recursive: true, force: true });
	}
	symlinkSync(NODE_MODULES_NOSYNC, link);
	console.info(
		"[ensure-deps] Restored node_modules -> node_modules.nosync symlink",
	);
}
