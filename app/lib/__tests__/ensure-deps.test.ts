import { describe, expect, it } from "vitest";
import {
	findIcloudStraySymlinks,
	NODE_MODULES_NOSYNC,
	resolveEnsureDepsAction,
} from "../ensure-deps";

describe("findIcloudStraySymlinks", () => {
	it("returns iCloud-renamed node_modules duplicates", () => {
		expect(
			findIcloudStraySymlinks([
				"app",
				"node_modules",
				"node_modules 2",
				"node_modules 3",
				"package.json",
			]),
		).toEqual(["node_modules 2", "node_modules 3"]);
	});

	it("ignores unrelated entries", () => {
		expect(
			findIcloudStraySymlinks(["node_modules", "node_modules-extra"]),
		).toEqual([]);
	});
});

describe("resolveEnsureDepsAction", () => {
	it("noops for standard CI installs with a real node_modules directory", () => {
		expect(
			resolveEnsureDepsAction({
				hasNosyncStore: false,
				hasNodeModules: true,
				isSymlink: false,
				symlinkTarget: null,
			}),
		).toBe("noop");
	});

	it("fails when neither node_modules layout exists", () => {
		expect(
			resolveEnsureDepsAction({
				hasNosyncStore: false,
				hasNodeModules: false,
				isSymlink: false,
				symlinkTarget: null,
			}),
		).toBe("fail_no_install");
	});

	it("noops when iCloud symlink is already correct", () => {
		expect(
			resolveEnsureDepsAction({
				hasNosyncStore: true,
				hasNodeModules: true,
				isSymlink: true,
				symlinkTarget: NODE_MODULES_NOSYNC,
			}),
		).toBe("noop");
	});

	it("restores symlink when iCloud store exists but link is broken", () => {
		expect(
			resolveEnsureDepsAction({
				hasNosyncStore: true,
				hasNodeModules: true,
				isSymlink: false,
				symlinkTarget: null,
			}),
		).toBe("restore_symlink");

		expect(
			resolveEnsureDepsAction({
				hasNosyncStore: true,
				hasNodeModules: true,
				isSymlink: true,
				symlinkTarget: "node_modules 2",
			}),
		).toBe("restore_symlink");

		expect(
			resolveEnsureDepsAction({
				hasNosyncStore: true,
				hasNodeModules: false,
				isSymlink: false,
				symlinkTarget: null,
			}),
		).toBe("restore_symlink");
	});
});
