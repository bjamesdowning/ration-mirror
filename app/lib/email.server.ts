/**
 * Email delivery utility via Resend API.
 *
 * Sends transactional emails from Cloudflare Workers using a plain `fetch`
 * call — no SDK, no Node.js dependencies. The RESEND_API_KEY is read
 * exclusively from the server-side env binding and is never exposed to the
 * client.
 *
 * Usage:
 *   await sendEmail(apiKey, {
 *     to: "user@example.com",
 *     subject: "Your sign-in link",
 *     html: "<p>Click <a href='...'>here</a> to sign in</p>",
 *   });
 */

export interface EmailPayload {
	to: string;
	subject: string;
	html: string;
	text?: string; // Plain-text fallback (recommended for deliverability)
}

const FROM_ADDRESS = "Ration <noreply@mayutic.com>";
const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Send a transactional email using Resend.
 * Designed to be fire-and-forget in auth flows to prevent timing attacks —
 * the caller should NOT await this when used within `sendMagicLink`.
 */
export async function sendEmail(
	apiKey: string,
	payload: EmailPayload,
): Promise<void> {
	const body = JSON.stringify({
		from: FROM_ADDRESS,
		to: [payload.to],
		subject: payload.subject,
		html: payload.html,
		...(payload.text ? { text: payload.text } : {}),
	});

	const response = await fetch(RESEND_API_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body,
	});

	if (!response.ok) {
		// Log error without exposing the API key or user PII in the message
		const status = response.status;
		throw new Error(`Resend API error: HTTP ${status}`);
	}
}

/**
 * Build a branded HTML email for magic link authentication.
 * Returns both HTML and plain-text versions.
 */
export function buildMagicLinkEmail(
	url: string,
): Pick<EmailPayload, "html" | "text"> {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in to Ration</title>
</head>
<body style="margin:0;padding:0;background-color:#F8F9FA;font-family:'Space Mono',Courier,monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#F8F9FA;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:480px;background-color:#FFFFFF;border-radius:16px;border:1px solid #E6E6E6;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #E6E6E6;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#111111;letter-spacing:-0.5px;">
                Ration<span style="color:#00E088;">.app</span>
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111111;letter-spacing:-0.5px;">
                Your sign-in link
              </h1>
              <p style="margin:0 0 28px;font-size:14px;color:#666666;line-height:1.6;">
                Click the button below to sign in to your Ration account. This link expires in 5 minutes and can only be used once.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="border-radius:12px;background-color:#00E088;">
                    <a href="${url}" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#111111;text-decoration:none;letter-spacing:0.25px;">
                      Sign in to Ration →
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Fallback URL -->
              <p style="margin:28px 0 0;font-size:12px;color:#999999;line-height:1.5;">
                Or copy and paste this link into your browser:<br />
                <a href="${url}" style="color:#00E088;word-break:break-all;">${url}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #E6E6E6;background-color:#F8F9FA;">
              <p style="margin:0;font-size:11px;color:#999999;line-height:1.5;">
                If you didn't request this link, you can safely ignore this email. Your account security is not at risk.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

	const text = `Sign in to Ration

Click the link below to sign in. This link expires in 5 minutes and can only be used once.

${url}

If you didn't request this link, you can safely ignore this email.`;

	return { html, text };
}
