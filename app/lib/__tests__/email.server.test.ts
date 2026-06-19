import { describe, expect, it, vi } from "vitest";
import type { EmailPayload } from "~/lib/email.server";
import {
	buildClaimOtpEmail,
	buildMagicLinkEmail,
	buildReengagementEmail,
	buildWelcomeEmail,
	EMAIL_FROM,
	sendEmail,
} from "~/lib/email.server";
import { MCP_ENDPOINT_URL } from "~/lib/mcp/connect-copy";

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
			expect(result.html).toContain("Your sign-in link");
			expect(result.html).toContain("5 minutes");
		});

		it("text contains sign-in instructions", () => {
			const result = buildMagicLinkEmail("https://test.com/verify");

			expect(result.text).toContain("Sign in to Ration");
			expect(result.text).toContain("5 minutes");
		});
	});

	describe("buildClaimOtpEmail", () => {
		it("includes the OTP in html and text", () => {
			const result = buildClaimOtpEmail("482910");

			expect(result.html).toContain("482910");
			expect(result.text).toContain("482910");
		});

		it("html contains claim kitchen branding", () => {
			const result = buildClaimOtpEmail("123456");

			expect(result.html).toContain("Claim your agent kitchen");
			expect(result.html).toContain("10 minutes");
		});
	});

	describe("buildWelcomeEmail", () => {
		const hubUrl = "https://ration.mayutic.com/hub";
		const connectUrl = "https://ration.mayutic.com/connect";
		const privacyUrl = "https://ration.mayutic.com/legal/privacy";
		const baseParams = { hubUrl, connectUrl, privacyUrl };

		it("returns a benefit-led subject", () => {
			const result = buildWelcomeEmail(baseParams);

			expect(result.subject).toBe("Your orbital pantry is ready");
		});

		it("includes hub URL and CTA in html", () => {
			const result = buildWelcomeEmail(baseParams);

			expect(result.html).toContain(hubUrl);
			expect(result.html).toContain("Open your Hub →");
			expect(result.html).toContain("Ration");
		});

		it("includes MCP connection instructions", () => {
			const result = buildWelcomeEmail(baseParams);

			expect(result.html).toContain("Connect your AI assistant");
			expect(result.html).toContain(MCP_ENDPOINT_URL);
			expect(result.html).toContain("Cursor");
			expect(result.html).toContain("Claude Desktop");
			expect(result.html).toContain(connectUrl);
			expect(result.html).toContain("Full MCP setup guide");
			expect(result.text).toContain(MCP_ENDPOINT_URL);
			expect(result.text).toContain(connectUrl);
		});

		it("includes preheader and feature bullets", () => {
			const result = buildWelcomeEmail(baseParams);

			expect(result.html).toContain("connect Cursor or Claude via MCP");
			expect(result.html).toContain("Cargo");
			expect(result.html).toContain("Galley");
			expect(result.html).toContain("Manifest");
		});

		it("personalizes greeting when userName is provided", () => {
			const result = buildWelcomeEmail({
				...baseParams,
				userName: "Billy Downing",
			});

			expect(result.html).toContain("Welcome aboard, Billy");
			expect(result.text).toContain("Welcome aboard, Billy");
		});

		it("escapes HTML in user names", () => {
			const result = buildWelcomeEmail({
				...baseParams,
				userName: "<script>alert(1)</script>",
			});

			expect(result.html).not.toContain("<script>");
			expect(result.html).toContain("&lt;script&gt;");
		});

		it("uses generic greeting when userName is absent", () => {
			const result = buildWelcomeEmail(baseParams);

			expect(result.html).toContain("Welcome aboard");
			expect(result.html).not.toContain("Welcome aboard,");
			expect(result.text).toContain("Welcome aboard");
		});

		it("text version contains hub URL and feature bullets", () => {
			const result = buildWelcomeEmail(baseParams);

			expect(result.text).toContain(hubUrl);
			expect(result.text).toContain("Cargo");
			expect(result.text).toContain(privacyUrl);
		});
	});

	describe("buildReengagementEmail", () => {
		const hubUrl = "https://ration.mayutic.com/hub";
		const connectUrl = "https://ration.mayutic.com/connect";
		const privacyUrl = "https://ration.mayutic.com/legal/privacy";
		const baseParams = { hubUrl, connectUrl, privacyUrl, inactiveDays: 30 };

		it("returns a compelling subject and inactive-day preheader", () => {
			const result = buildReengagementEmail(baseParams);

			expect(result.subject).toBe("Time to check your orbital pantry");
			expect(result.html).toContain("30 days");
			expect(result.html).toContain("connect Cursor and Claude via MCP");
		});

		it("includes hub CTA, feature bullets, and MCP setup", () => {
			const result = buildReengagementEmail(baseParams);

			expect(result.html).toContain("Return to your Hub →");
			expect(result.html).toContain(hubUrl);
			expect(result.html).toContain("Cargo");
			expect(result.html).toContain("Galley");
			expect(result.html).toContain("Manifest");
			expect(result.html).toContain(MCP_ENDPOINT_URL);
			expect(result.html).toContain(connectUrl);
			expect(result.text).toContain(MCP_ENDPOINT_URL);
		});

		it("personalizes greeting when userName is provided", () => {
			const result = buildReengagementEmail({
				...baseParams,
				userName: "Billy Downing",
			});

			expect(result.html).toContain("We miss you, Billy");
			expect(result.text).toContain("We miss you, Billy");
		});

		it("uses generic greeting when userName is absent", () => {
			const result = buildReengagementEmail(baseParams);

			expect(result.html).toContain("Your kitchen misses you");
			expect(result.text).toContain("Your kitchen misses you");
		});
	});

	describe("sendEmail", () => {
		it("throws on send failure", async () => {
			const mockEmail = {
				send: vi.fn().mockRejectedValue(new Error("E_DELIVERY_FAILED")),
			} as unknown as SendEmail;

			await expect(
				sendEmail(mockEmail, {
					to: "user@example.com",
					subject: "Test",
					html: "<p>Test</p>",
					text: "Test",
				}),
			).rejects.toThrow("Email send failed: E_DELIVERY_FAILED");
		});

		it("sends correct payload via EMAIL binding when successful", async () => {
			const mockSend = vi.fn().mockResolvedValue({ messageId: "test-id" });
			const mockEmail = { send: mockSend } as unknown as SendEmail;

			const payload: EmailPayload = {
				to: "user@example.com",
				subject: "Your sign-in link",
				html: "<p>Click here</p>",
				text: "Click here",
			};

			await sendEmail(mockEmail, payload);

			expect(mockSend).toHaveBeenCalledTimes(1);
			expect(mockSend).toHaveBeenCalledWith({
				from: EMAIL_FROM,
				to: payload.to,
				subject: payload.subject,
				html: payload.html,
				text: payload.text,
			});
		});
	});
});
