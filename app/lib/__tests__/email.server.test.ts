import { describe, expect, it, vi } from "vitest";
import type { EmailPayload } from "~/lib/email.server";
import { buildMagicLinkEmail } from "~/lib/email.server";

describe("email.server", () => {
	describe("buildMagicLinkEmail", () => {
		it("returns html and text with the magic link URL", () => {
			const url =
				"https://ration.mayutic.com/api/auth/magic-link/verify?token=abc123";
			const result = buildMagicLinkEmail(url);

			expect(result).toHaveProperty("html");
			expect(result).toHaveProperty("text");
			expect(typeof result.html).toBe("string");
			expect(typeof result.text).toBe("string");
		});

		it("includes the URL in both html and text output", () => {
			const url = "https://example.com/verify?token=xyz789";
			const result = buildMagicLinkEmail(url);

			expect(result.html).toContain(url);
			expect(result.text).toContain(url);
		});

		it("html contains Ration branding", () => {
			const result = buildMagicLinkEmail("https://test.com/verify");

			expect(result.html).toContain("Ration");
			expect(result.html).toContain("Sign in to Ration");
			expect(result.html).toContain("5 minutes");
		});

		it("text contains sign-in instructions", () => {
			const result = buildMagicLinkEmail("https://test.com/verify");

			expect(result.text).toContain("Sign in to Ration");
			expect(result.text).toContain("5 minutes");
		});
	});

	describe("sendEmail", () => {
		it("throws on non-ok response", async () => {
			const { sendEmail } = await import("~/lib/email.server");
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi
				.fn()
				.mockResolvedValue({ ok: false, status: 500 }) as typeof fetch;

			await expect(
				sendEmail("test-api-key", {
					to: "user@example.com",
					subject: "Test",
					html: "<p>Test</p>",
				}),
			).rejects.toThrow("Resend API error: HTTP 500");

			globalThis.fetch = originalFetch;
		});

		it("sends correct Resend API payload when successful", async () => {
			const { sendEmail } = await import("~/lib/email.server");
			const mockFetch = vi.fn().mockResolvedValue({ ok: true });
			const originalFetch = globalThis.fetch;
			globalThis.fetch = mockFetch as typeof fetch;

			const payload: EmailPayload = {
				to: "user@example.com",
				subject: "Your sign-in link",
				html: "<p>Click here</p>",
				text: "Click here",
			};

			await sendEmail("sk_test_123", payload);

			expect(mockFetch).toHaveBeenCalledTimes(1);
			const [callUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
			const headers = new Headers(init?.headers as HeadersInit);
			expect(callUrl).toBe("https://api.resend.com/emails");
			expect(init?.method).toBe("POST");
			expect(headers.get("Authorization")).toBe("Bearer sk_test_123");
			expect(headers.get("Content-Type")).toBe("application/json");

			const body = JSON.parse(init?.body as string);
			expect(body.from).toBe("Ration <noreply@mayutic.com>");
			expect(body.to).toEqual(["user@example.com"]);
			expect(body.subject).toBe(payload.subject);
			expect(body.html).toBe(payload.html);
			expect(body.text).toBe(payload.text);

			globalThis.fetch = originalFetch;
		});
	});
});
