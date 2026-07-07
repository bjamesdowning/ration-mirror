import { describe, expect, it } from "vitest";
import { sha256Hex } from "../crypto.server";

describe("sha256Hex", () => {
	it("returns deterministic output for the same input", async () => {
		const a = await sha256Hex("tomato paste");
		const b = await sha256Hex("tomato paste");
		expect(a).toBe(b);
	});

	it("returns different hashes for different inputs", async () => {
		const a = await sha256Hex("tomato paste");
		const b = await sha256Hex("tomato puree");
		expect(a).not.toBe(b);
	});

	it("truncates to the requested length", async () => {
		const full = await sha256Hex("ration", 0);
		const truncated = await sha256Hex("ration", 32);
		expect(full.length).toBe(64);
		expect(truncated.length).toBe(32);
		expect(full.startsWith(truncated)).toBe(true);
	});
});
