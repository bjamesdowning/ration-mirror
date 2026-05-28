/**
 * Ensures `node_modules` is a symlink to `node_modules.nosync`.
 * iCloud Drive can rename conflicting symlinks (e.g. "node_modules 2"), which
 * breaks bun scripts that expect `node_modules/.bin/*` on PATH.
 */
import {
	existsSync,
	lstatSync,
	readlinkSync,
	readdirSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const target = join(root, "node_modules.nosync");
const link = join(root, "node_modules");

// Clean up iCloud-renamed symlink duplicates if present.
for (const entry of readdirSync(root)) {
	if (/^node_modules \d+$/.test(entry)) {
		const strayPath = join(root, entry);
		if (lstatSync(strayPath).isSymbolicLink()) {
			rmSync(strayPath);
		}
	}
}

if (!existsSync(target)) {
	console.error(
		"[ensure-deps] node_modules.nosync is missing — run `bun install` first.",
	);
	process.exit(1);
}

const linkOk =
	existsSync(link) &&
	lstatSync(link).isSymbolicLink() &&
	readlinkSync(link) === "node_modules.nosync";

if (!linkOk) {
	if (existsSync(link)) {
		rmSync(link, { recursive: true, force: true });
	}
	symlinkSync("node_modules.nosync", link);
	console.info(
		"[ensure-deps] Restored node_modules -> node_modules.nosync symlink",
	);
}
