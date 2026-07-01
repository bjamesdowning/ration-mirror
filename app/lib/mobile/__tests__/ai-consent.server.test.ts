import { describe, expect, it, vi } from "vitest";

const getMobileUser = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	getMobileUser: (...args: unknown[]) => getMobileUser(...args),
}));

async function importSubject() {
	return await import("~/lib/mobile/ai-consent.server");
}

describe("requireMobileAIConsent", () => {
	it("resolves without throwing when aiConsentAt is a non-empty ISO string", async () => {
		getMobileUser.mockResolvedValue({
			settings: { aiConsentAt: "2026-06-01T00:00:00.000Z" },
		});
		const { requireMobileAIConsent } = await importSubject();

		await expect(
			requireMobileAIConsent({} as Cloudflare.Env, "user_1"),
		).resolves.toBeUndefined();
	});

	it("throws a 403 with code ai_consent_required when aiConsentAt is null/undefined", async () => {
		getMobileUser.mockResolvedValue({ settings: {} });
		const { requireMobileAIConsent } = await importSubject();

		await expect(
			requireMobileAIConsent({} as Cloudflare.Env, "user_1"),
		).rejects.toMatchObject({
			init: { status: 403 },
			data: { code: "ai_consent_required" },
		});
	});

	it("throws the same 403 when aiConsentAt is an empty/whitespace string", async () => {
		getMobileUser.mockResolvedValue({ settings: { aiConsentAt: "   " } });
		const { requireMobileAIConsent } = await importSubject();

		await expect(
			requireMobileAIConsent({} as Cloudflare.Env, "user_1"),
		).rejects.toMatchObject({
			init: { status: 403 },
			data: { code: "ai_consent_required" },
		});
	});

	it("throws the same 403 when the user record is missing entirely", async () => {
		getMobileUser.mockResolvedValue(undefined);
		const { requireMobileAIConsent } = await importSubject();

		await expect(
			requireMobileAIConsent({} as Cloudflare.Env, "user_1"),
		).rejects.toMatchObject({
			init: { status: 403 },
			data: { code: "ai_consent_required" },
		});
	});
});
