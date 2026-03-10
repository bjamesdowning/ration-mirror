import { describe, expect, it } from "vitest";
import {
	buildReceiptPdfPrompt,
	buildScanPrompt,
} from "~/lib/scan-consumer.server";

const TODAY = "2026-03-10";

describe("buildScanPrompt", () => {
	it("returns a non-empty string", () => {
		const prompt = buildScanPrompt(TODAY);
		expect(typeof prompt).toBe("string");
		expect(prompt.length).toBeGreaterThan(0);
	});

	it("includes the JSON schema shape", () => {
		const prompt = buildScanPrompt(TODAY);
		expect(prompt).toContain('"items"');
		expect(prompt).toContain('"name"');
		expect(prompt).toContain('"quantity"');
		expect(prompt).toContain('"unit"');
		expect(prompt).toContain('"confidence"');
	});

	it("embeds today's date in expiry rules", () => {
		const prompt = buildScanPrompt(TODAY);
		expect(prompt).toContain(TODAY);
	});

	it("instructs the model to strip brand names", () => {
		const prompt = buildScanPrompt(TODAY);
		expect(prompt.toLowerCase()).toContain("brand");
	});

	it("instructs the model to respond with only JSON", () => {
		const prompt = buildScanPrompt(TODAY);
		expect(prompt).toContain("ONLY");
	});
});

describe("buildReceiptPdfPrompt", () => {
	it("returns a non-empty string", () => {
		const prompt = buildReceiptPdfPrompt(TODAY);
		expect(typeof prompt).toBe("string");
		expect(prompt.length).toBeGreaterThan(0);
	});

	it("includes the JSON schema shape", () => {
		const prompt = buildReceiptPdfPrompt(TODAY);
		expect(prompt).toContain('"items"');
		expect(prompt).toContain('"name"');
		expect(prompt).toContain('"quantity"');
		expect(prompt).toContain('"unit"');
		expect(prompt).toContain('"confidence"');
	});

	it("embeds today's date in expiry rules", () => {
		const prompt = buildReceiptPdfPrompt(TODAY);
		expect(prompt).toContain(TODAY);
	});

	it("instructs the model to strip brand names", () => {
		const prompt = buildReceiptPdfPrompt(TODAY);
		expect(prompt.toLowerCase()).toContain("brand");
	});

	it("instructs the model to ignore non-product lines (totals, discounts)", () => {
		const prompt = buildReceiptPdfPrompt(TODAY);
		expect(prompt.toLowerCase()).toContain("discount");
		expect(prompt.toLowerCase()).toContain("total");
	});

	it("instructs the model to handle weighted items (kg lines)", () => {
		const prompt = buildReceiptPdfPrompt(TODAY);
		expect(prompt.toLowerCase()).toContain("weight");
	});

	it("instructs the model to respond with only JSON", () => {
		const prompt = buildReceiptPdfPrompt(TODAY);
		expect(prompt).toContain("ONLY");
	});

	it("produces a different prompt than the image scan prompt", () => {
		const imagePrompt = buildScanPrompt(TODAY);
		const pdfPrompt = buildReceiptPdfPrompt(TODAY);
		expect(pdfPrompt).not.toBe(imagePrompt);
	});
});
