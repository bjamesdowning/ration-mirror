import { describe, expect, it } from "vitest";
import {
	assertComparisonAnswerWordCounts,
	buildLlmsComparisonFacts,
	formatLlmsComparisonFactsMarkdown,
} from "~/lib/llms-comparison-facts.server";
import {
	buildOpenApiDocument,
	countMcpTools,
	openApiComponentNames,
} from "~/lib/openapi-document.server";

const request = new Request("https://ration.mayutic.com/");

describe("buildOpenApiDocument", () => {
	it("documents agent auth and v1 paths with JSON Schema components", () => {
		const doc = buildOpenApiDocument(request);

		expect(doc.paths["/api/agent/auth"]?.post).toBeDefined();
		expect(doc.paths["/api/agent/auth/claim/complete"]?.post).toBeDefined();
		expect(doc.paths["/api/agent/auth/claim/reissue"]?.post).toBeDefined();

		for (const name of openApiComponentNames()) {
			expect(
				(doc.components.schemas as Record<string, unknown>)[name],
			).toBeDefined();
		}

		const registerBody =
			doc.paths["/api/agent/auth"].post.requestBody.content["application/json"]
				.schema;
		expect(registerBody.$ref).toBe(
			"#/components/schemas/AgentAnonRegisterRequest",
		);

		const galleyImport =
			doc.paths["/api/v1/galley/import"].post.requestBody.content[
				"application/json"
			].schema;
		expect(galleyImport.$ref).toBe("#/components/schemas/GalleyManifest");
	});

	it("counts MCP tools consistently with discovery metadata", () => {
		expect(countMcpTools()).toBeGreaterThan(30);
		expect(buildOpenApiDocument(request).info.description).toContain(
			String(countMcpTools()),
		);
	});
});

describe("buildLlmsComparisonFacts", () => {
	const facts = buildLlmsComparisonFacts({
		origin: "https://ration.mayutic.com",
		maxInventoryItems: 50,
		maxMeals: 25,
		maxGroceryLists: 3,
		crewMonthlyPrice: "$2/mo",
		crewAnnualPrice: "$12/yr",
	});

	it("renders extractable Q&A markdown for llms.txt", () => {
		const markdown = formatLlmsComparisonFactsMarkdown(facts);
		expect(markdown).toContain("## Quick answers for AI agents");
		expect(markdown).toContain("### Q: What is Ration?");
		expect(markdown).toContain("**A:**");
		expect(markdown).toContain("50 Cargo pantry items");
		expect(markdown).toContain(String(countMcpTools()));
	});

	it("keeps answers within AEO direct-answer word-count band", () => {
		expect(() => assertComparisonAnswerWordCounts(facts)).not.toThrow();
	});
});
