/**
 * Email delivery via Cloudflare Email Service Workers binding.
 *
 * Sends transactional emails using `env.EMAIL.send()` — no third-party API
 * keys, no Node.js dependencies.
 *
 * Usage:
 *   await sendEmail(env.EMAIL, {
 *     to: "user@example.com",
 *     subject: "Your sign-in link",
 *     html: "<p>Click <a href='...'>here</a> to sign in</p>",
 *     text: "Click here: ...",
 *   });
 */

export interface EmailPayload {
	to: string;
	subject: string;
	html: string;
	text: string;
}

export const EMAIL_FROM = {
	email: "noreply@mayutic.com",
	name: "Ration",
} as const;

interface EmailLayoutOptions {
	preheader: string;
	title: string;
	bodyHtml: string;
	footerHtml?: string;
}

function wrapEmailLayout({
	preheader,
	title,
	bodyHtml,
	footerHtml,
}: EmailLayoutOptions): string {
	const defaultFooter = `If you didn't request this email, you can safely ignore it. Your account security is not at risk.`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#F8F9FA;font-family:'Space Mono',Courier,monospace;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#F8F9FA;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:480px;background-color:#FFFFFF;border-radius:16px;border:1px solid #E6E6E6;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #E6E6E6;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#111111;letter-spacing:-0.5px;">
                Ration<span style="color:#00E088;">.app</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #E6E6E6;background-color:#F8F9FA;">
              <p style="margin:0;font-size:11px;color:#999999;line-height:1.5;">
                ${footerHtml ?? defaultFooter}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function emailButton(href: string, label: string): string {
	return `<table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="border-radius:12px;background-color:#00E088;">
                    <a href="${href}" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#111111;text-decoration:none;letter-spacing:0.25px;">
                      ${label}
                    </a>
                  </td>
                </tr>
              </table>`;
}

/**
 * Send a transactional email using Cloudflare Email Service.
 * Designed to be fire-and-forget in auth flows to prevent timing attacks —
 * the caller should NOT await this when used within `sendMagicLink`.
 */
export async function sendEmail(
	email: SendEmail,
	payload: EmailPayload,
): Promise<void> {
	try {
		await email.send({
			from: EMAIL_FROM,
			to: payload.to,
			subject: payload.subject,
			html: payload.html,
			text: payload.text,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Email send failed: ${message}`);
	}
}

/**
 * Build a branded HTML email for magic link authentication.
 */
export function buildMagicLinkEmail(
	url: string,
): Pick<EmailPayload, "html" | "text"> {
	const bodyHtml = `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111111;letter-spacing:-0.5px;">
                Your sign-in link
              </h1>
              <p style="margin:0 0 28px;font-size:14px;color:#666666;line-height:1.6;">
                Click the button below to sign in to your Ration account. This link expires in 5 minutes and can only be used once.
              </p>
              ${emailButton(url, "Sign in to Ration →")}
              <p style="margin:28px 0 0;font-size:12px;color:#999999;line-height:1.5;">
                Or copy and paste this link into your browser:<br />
                <a href="${url}" style="color:#00E088;word-break:break-all;">${url}</a>
              </p>`;

	const html = wrapEmailLayout({
		preheader: "Your one-time Ration sign-in link — expires in 5 minutes.",
		title: "Sign in to Ration",
		bodyHtml,
	});

	const text = `Sign in to Ration

Click the link below to sign in. This link expires in 5 minutes and can only be used once.

${url}

If you didn't request this link, you can safely ignore this email.`;

	return { html, text };
}

/**
 * Build a branded HTML email for agent claim OTP verification.
 */
export function buildClaimOtpEmail(
	otp: string,
): Pick<EmailPayload, "html" | "text"> {
	const bodyHtml = `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111111;">
                Claim your agent kitchen
              </h1>
              <p style="margin:0 0 28px;font-size:14px;color:#666666;line-height:1.6;">
                Enter this code to verify your email and link your AI agent to your Ration account. Expires in 10 minutes.
              </p>
              <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:8px;color:#00E088;">
                ${otp}
              </p>`;

	const html = wrapEmailLayout({
		preheader: "Your Ration agent verification code — expires in 10 minutes.",
		title: "Claim your Ration agent kitchen",
		bodyHtml,
	});

	const text = `Claim your Ration agent kitchen

Your verification code: ${otp}

This code expires in 10 minutes.`;

	return { html, text };
}

function firstNameFromUserName(userName?: string | null): string | null {
	if (!userName?.trim()) return null;
	const first = userName.trim().split(/\s+/)[0];
	return first || null;
}

/**
 * Build a post-signup welcome email that drives users to their Hub.
 */
export function buildWelcomeEmail(params: {
	hubUrl: string;
	privacyUrl: string;
	userName?: string | null;
}): Pick<EmailPayload, "html" | "text"> & { subject: string } {
	const { hubUrl, privacyUrl, userName } = params;
	const firstName = firstNameFromUserName(userName);
	const greeting = firstName
		? `Welcome aboard, ${firstName}`
		: "Welcome aboard";
	const subject = "Your orbital pantry is ready";
	const preheader =
		"Track cargo, plan meals, and cut waste — open your Hub to get started.";

	const bodyHtml = `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111111;letter-spacing:-0.5px;">
                ${greeting}
              </h1>
              <p style="margin:0 0 20px;font-size:14px;color:#666666;line-height:1.6;">
                Your personal supply group is provisioned and waiting. Ration is your orbital supply chain — zero-latency inventory, AI-assisted meal planning, and automated waste reduction.
              </p>
              ${emailButton(hubUrl, "Open your Hub →")}
              <p style="margin:28px 0 12px;font-size:13px;font-weight:700;color:#111111;">
                What you can do right now:
              </p>
              <ul style="margin:0 0 24px;padding:0 0 0 20px;font-size:14px;color:#666666;line-height:1.8;">
                <li><strong style="color:#111111;">Cargo</strong> — track dry and frozen inventory with expiry alerts</li>
                <li><strong style="color:#111111;">Galley</strong> — build recipes from what you already have on board</li>
                <li><strong style="color:#111111;">Manifest</strong> — schedule your weekly meal plan in one view</li>
              </ul>
              <p style="margin:0;font-size:12px;color:#999999;line-height:1.5;">
                Or copy and paste this link into your browser:<br />
                <a href="${hubUrl}" style="color:#00E088;word-break:break-all;">${hubUrl}</a>
              </p>`;

	const footerHtml = `You're receiving this because you created a Ration account. <a href="${privacyUrl}" style="color:#00E088;">Privacy policy</a> · Built by Mayutic`;

	const html = wrapEmailLayout({
		preheader,
		title: subject,
		bodyHtml,
		footerHtml,
	});

	const text = `${greeting}

Your personal supply group is provisioned and waiting. Open your Hub to get started:

${hubUrl}

What you can do right now:
- Cargo — track dry and frozen inventory with expiry alerts
- Galley — build recipes from what you already have on board
- Manifest — schedule your weekly meal plan in one view

You're receiving this because you created a Ration account.
Privacy policy: ${privacyUrl}
Built by Mayutic`;

	return { subject, html, text };
}

/** Returns true when email sending should be skipped (local dev without binding). */
export function shouldSkipEmailSend(env: {
	EMAIL?: SendEmail;
	BETTER_AUTH_URL: string;
}): boolean {
	if (!env.EMAIL) return true;
	return env.BETTER_AUTH_URL.includes("localhost");
}
