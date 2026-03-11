import { afterEach, describe, expect, it } from "vitest";
import {
	lockBodyScroll,
	resetBodyScrollLockForTests,
} from "~/lib/body-scroll-lock";

function makeHost(initialOverflow = "") {
	return {
		body: {
			style: {
				overflow: initialOverflow,
			},
		},
	};
}

afterEach(() => {
	resetBodyScrollLockForTests();
});

describe("lockBodyScroll", () => {
	it("locks and restores overflow for a single overlay", () => {
		const host = makeHost("auto");
		const release = lockBodyScroll(host);

		expect(host.body.style.overflow).toBe("hidden");

		release();

		expect(host.body.style.overflow).toBe("auto");
	});

	it("keeps lock active until the last overlay releases", () => {
		const host = makeHost("");
		const releaseA = lockBodyScroll(host);
		const releaseB = lockBodyScroll(host);

		expect(host.body.style.overflow).toBe("hidden");

		releaseA();
		expect(host.body.style.overflow).toBe("hidden");

		releaseB();
		expect(host.body.style.overflow).toBe("");
	});

	it("is safe to release the same lock function more than once", () => {
		const host = makeHost("visible");
		const release = lockBodyScroll(host);

		release();
		release();

		expect(host.body.style.overflow).toBe("visible");
	});
});
