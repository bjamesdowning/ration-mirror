import { JsonLd } from "~/components/seo/JsonLd";
import { canonicalMeta, ogMeta } from "~/lib/seo";
import { breadcrumbSchema, webPageSchema } from "~/lib/structured-data";
import type { Route } from "./+types/legal.privacy";

export const meta: Route.MetaFunction = () => {
	const title = "Privacy Policy | Ration";
	const description = "Privacy Policy for the Ration platform.";
	return [
		{ title },
		{ name: "description", content: description },
		canonicalMeta("/legal/privacy"),
		...ogMeta({ title, description, path: "/legal/privacy" }),
	];
};

const schemas = [
	webPageSchema({
		name: "Privacy Policy",
		description: "Privacy Policy for the Ration platform.",
		path: "/legal/privacy",
		dateModified: "2026-04-08",
	}),
	breadcrumbSchema([
		{ name: "Home", path: "/" },
		{ name: "Legal", path: "/legal/privacy" },
		{ name: "Privacy Policy", path: "/legal/privacy" },
	]),
];

export default function PrivacyPolicy() {
	return (
		<>
			<JsonLd data={schemas} />
			<h1>Privacy Policy</h1>
			<p className="text-sm text-muted mb-8 glass-panel rounded-lg p-4">
				Last Updated: April 8, 2026
			</p>

			<h2>1. Introduction</h2>
			<p>
				Ration Operating Company ("us", "we", or "our") operates the Ration
				platform (the "Service"). This page informs you of our policies
				regarding the collection, use, and disclosure of personal data when you
				use our Service and the choices you have associated with that data.
			</p>

			<h2>2. Information We Collect</h2>
			<p>
				We collect several different types of information for various purposes
				to provide and improve our Service to you.
			</p>

			<h3>Personal Data</h3>
			<p>
				While using our Service, we may ask you to provide us with certain
				personally identifiable information that can be used to contact or
				identify you ("Personal Data"). Personally identifiable information may
				include, but is not limited to:
			</p>
			<ul>
				<li>
					Email address (used for magic link sign-in and account identification)
				</li>
				<li>First name and last name</li>
				<li>Profile picture (via OAuth providers)</li>
				<li>Cookies and Usage Data</li>
			</ul>

			<h3>Usage Data</h3>
			<p>
				We may also collect information on how the Service is accessed and used
				("Usage Data"). This Usage Data may include information such as your
				computer's Internet Protocol address (e.g. IP address), browser type,
				browser version, the pages of our Service that you visit, the time and
				date of your visit, the time spent on those pages, unique device
				identifiers and other diagnostic data.
			</p>

			<h3>Cargo & Visual Data</h3>
			<p>
				We collect data regarding items in your digital Cargo ("Cargo Data") and
				images you upload or scan for the purpose of item recognition ("Visual
				Data").
			</p>

			<h3 id="allergen">Dietary & Allergen Data (Special Category)</h3>
			<div className="glass-panel rounded-xl p-6 my-6 border border-hyper-green/20">
				<p className="font-bold text-carbon">Health Data — GDPR Article 9</p>
				<p className="mt-2">
					Ration allows you to record dietary restrictions and allergens (e.g.
					gluten, nuts, dairy) to personalise meal recommendations and flag
					unsafe ingredients. Under GDPR Article 9, allergen data is considered{" "}
					<strong>special category health data</strong> because it may reveal
					information about your medical condition or physiological make-up.
				</p>
				<p className="mt-2">
					We process this data <strong>only</strong> on the basis of your{" "}
					<strong>explicit consent (GDPR Art. 9(2)(a))</strong> — specifically,
					the act of adding allergen information in your account settings. You
					may withdraw this consent at any time by removing your allergen
					selections. Allergen data is used solely to personalise your
					experience within the Service and is never shared with third parties
					for marketing purposes.
				</p>
			</div>

			<h2>3. Cookies</h2>
			<p>
				We use cookies strictly necessary for the operation of our Service and
				to provide functionality you request. Per GDPR Article 13(1)(f), we
				disclose each cookie below:
			</p>
			<ul>
				<li>
					<strong>better-auth.session_token</strong> — Authentication and
					session management. Set when you sign in (magic link or OAuth). Allows
					us to recognise you and keep you logged in. Expiry: session duration
					(e.g. 7 days). Essential; exempt from consent.
				</li>
				<li>
					<strong>theme</strong> — A functionality cookie that stores your
					light/dark mode preference. It is set only when you actively use the
					theme toggle or change your theme in settings; it is not set
					automatically on first visit. Expiry: 1 year. Functionality cookie set
					in response to user action; exempt from consent.
				</li>
			</ul>
			<p>
				<strong>Cloudflare Web Analytics</strong> — We use Cloudflare Web
				Analytics to understand site performance. It does not use cookies and is
				privacy-preserving.
			</p>
			<p className="mt-3">
				<strong>Intercom Messenger</strong> — When you are signed in and using
				the main in-app experience, we may load{" "}
				<a
					href="https://www.intercom.com/legal/privacy"
					target="_blank"
					rel="noopener noreferrer"
					className="text-hyper-green hover:underline"
				>
					Intercom
				</a>{" "}
				to provide customer support and (where enabled) AI-assisted help
				(&quot;Fin&quot;). Intercom may set its own cookies or use similar
				storage on your device to operate the messenger. See Section 9 for
				categories of data shared with Intercom.
			</p>

			<h2>4. Children's Privacy</h2>
			<p>
				Our Service is not directed to individuals under the age of 16 (or the
				applicable age of digital consent in your jurisdiction). We do not
				knowingly collect personal data from children. If you are a parent or
				guardian and believe your child has provided us with personal data,
				please contact us at{" "}
				<a href="mailto:legal@mayutic.com">legal@mayutic.com</a> and we will
				delete that information promptly.
			</p>
			<p>
				If you are located in the United States, our Service is also not
				intended for children under 13 in accordance with the Children's Online
				Privacy Protection Act (COPPA).
			</p>

			<h2>5. How We Use Your Information</h2>
			<p>Ration uses the collected data for various purposes:</p>
			<ul>
				<li>To provide and maintain the Service</li>
				<li>To notify you about changes to our Service</li>
				<li>
					To allow you to participate in interactive features of our Service
					when you choose to do so
				</li>
				<li>To provide customer care and support</li>
				<li>
					To provide analysis or valuable information so that we can improve the
					Service
				</li>
				<li>To monitor the usage of the Service</li>
				<li>To detect, prevent and address technical issues</li>
				<li>To process payments via our third-party payment processor</li>
			</ul>

			<h2>6. Legal Basis for Processing (EU / UK Users)</h2>
			<p>
				Where the General Data Protection Regulation (GDPR) or UK GDPR applies,
				we rely on the following lawful bases under Article 6 to process your
				personal data:
			</p>
			<ul>
				<li>
					<strong>Performance of a contract (Art. 6(1)(b)):</strong> Account
					creation, service delivery, inventory storage, meal planning, and
					visual scanning — processing necessary to provide the Service you have
					signed up for.
				</li>
				<li>
					<strong>Legal obligation (Art. 6(1)(c)):</strong> Payment records and
					transaction history retained to comply with applicable tax and
					financial reporting laws.
				</li>
				<li>
					<strong>Legitimate interests (Art. 6(1)(f)):</strong> Security
					monitoring, fraud prevention, and service improvement — where our
					interests do not override your rights and freedoms.
				</li>
			</ul>
			<p>
				For allergen and dietary restriction data (special category data), we
				rely on your <strong>explicit consent (GDPR Art. 9(2)(a))</strong> as
				the legal basis. See Section 2 above.
			</p>

			<h2>7. Magic Link Authentication</h2>
			<div className="glass-panel rounded-xl p-6 my-6">
				<p className="font-bold text-carbon">Email-Based Sign-In</p>
				<p className="mt-2">
					We offer passwordless sign-in via magic links. When you enter your
					email address, we send you a one-time sign-in link to that address.
					The link expires in 5 minutes and can only be used once. We use your
					email solely to deliver this link and to identify your account. The
					sign-in link is delivered via our transactional email provider (see
					Data Processors below).
				</p>
			</div>

			<h2>8. Google User Data</h2>
			<div className="glass-panel rounded-xl p-6 my-6">
				<p className="font-bold text-carbon">Google OAuth Disclosure</p>
				<p className="mt-2">
					Our application uses Google OAuth to allow you to sign in. When you
					use this feature, we access your Google account profile information,
					specifically your name, email address, and profile picture.
				</p>
				<p className="mt-2">
					<strong className="text-carbon">We do NOT sell this data.</strong> We
					use this information solely for:
				</p>
				<ul className="list-disc pl-5 mt-2">
					<li>Authenticating your identity.</li>
					<li>Creating and managing your user account.</li>
					<li>Displaying your profile information within the application.</li>
				</ul>
				<p className="mt-2">
					We do not request or access any other Google user data (such as
					contacts, calendar, or drive files).
				</p>
			</div>

			<h2>9. Data Processors & Third Parties</h2>
			<p>
				We may employ third party companies and individuals to facilitate our
				Service ("Service Providers"), to provide the Service on our behalf, to
				perform Service-related services or to assist us in analyzing how our
				Service is used.
			</p>
			<p>
				These third parties have access to your Personal Data only to perform
				these tasks on our behalf and are obligated not to disclose or use it
				for any other purpose.
			</p>

			<ul>
				<li>
					<strong>Cloudflare:</strong> Infrastructure, edge computing, and
					security. Data stored: Application data, images (R2), database (D1).
				</li>
				<li>
					<strong>Resend:</strong> Transactional email delivery. We use Resend
					to send magic link sign-in emails to your email address. Resend
					processes your email address and the email content we provide solely
					for delivery. See{" "}
					<a
						href="https://resend.com/legal/privacy-policy"
						target="_blank"
						rel="noopener noreferrer"
						className="text-hyper-green hover:underline"
					>
						Resend&apos;s Privacy Policy
					</a>
					.
				</li>
				<li>
					<strong>Stripe:</strong> Payment processing. We do not store or
					collect your payment card details. That information is provided
					directly to Stripe.
				</li>
				<li>
					<strong>Better Auth:</strong> Authentication (session management,
					magic link verification, OAuth).
				</li>
				<li>
					<strong>Intercom:</strong> In-app customer support and (where enabled)
					automated assistance (Fin) for authenticated users in the main product
					workspace. We share identifiers and profile data with Intercom to
					recognise your account in the messenger, such as your user id, email
					address, name, account creation time, and (for workspace context) your
					active group identifier and product attributes we configure (e.g.
					subscription tier label, credit balance). Support conversations you
					start are processed by Intercom under their terms. See{" "}
					<a
						href="https://www.intercom.com/legal/privacy"
						target="_blank"
						rel="noopener noreferrer"
						className="text-hyper-green hover:underline"
					>
						Intercom&apos;s Privacy Policy
					</a>
					.
				</li>
				<li>
					<strong>
						AI Providers (Google Gemini via Cloudflare AI Gateway):
					</strong>{" "}
					We use Google Gemini (proxied via Cloudflare AI Gateway) to process
					the following categories of data:
					<ul className="list-disc pl-5 mt-1">
						<li>
							<strong>Visual Data</strong> — receipt and product images you
							upload, encoded as base64 and sent to Gemini for item
							identification (Scan feature). Images are deleted from our storage
							immediately after processing.
						</li>
						<li>
							<strong>Inventory Data</strong> — ingredient names and quantities
							from your Cargo, sent to Gemini to generate personalised meal
							suggestions.
						</li>
						<li>
							<strong>Allergen Profile</strong> — your dietary restriction
							settings, sent alongside inventory data to ensure AI-generated
							meals exclude unsafe ingredients.
						</li>
						<li>
							<strong>Recipe URLs & Page Content</strong> — web page content
							fetched from URLs you submit for recipe import, sent to Gemini for
							structured recipe extraction.
						</li>
					</ul>
					<p className="mt-1">
						Your data is not used to train these models. Processing is governed
						by Cloudflare&apos;s{" "}
						<a
							href="https://www.cloudflare.com/cloudflare-customer-dpa/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-hyper-green hover:underline"
						>
							AI Gateway terms
						</a>{" "}
						and{" "}
						<a
							href="https://ai.google.dev/gemini-api/terms"
							target="_blank"
							rel="noopener noreferrer"
							className="text-hyper-green hover:underline"
						>
							Google&apos;s Gemini API Terms
						</a>
						.
					</p>
				</li>
				<li>
					<strong>
						AI Providers — Cloudflare Workers AI (embedding model):
					</strong>{" "}
					We use Cloudflare Workers AI to generate semantic vector embeddings.
					Ingredient names from your Cargo (e.g. "whole milk", "chicken breast")
					are sent to the{" "}
					<code className="text-xs bg-platinum/50 px-1 rounded">
						@cf/google/embeddinggemma-300m
					</code>{" "}
					embedding model hosted on Cloudflare&apos;s infrastructure. The
					resulting vectors are stored in Cloudflare Vectorize and used solely
					to power semantic ingredient-matching features (e.g. matching recipe
					ingredients to your pantry). Embeddings are cached in Cloudflare KV
					for up to 7 days to reduce redundant processing. Embeddings are
					deleted when you remove the corresponding inventory item or purge your
					account. No personally identifiable information beyond ingredient name
					text is included in embedding requests.
				</li>
			</ul>

			<h2>10. International Data Transfers</h2>
			<p>
				Our Service Providers may process personal data in countries outside
				your country of residence, including the United States. Where GDPR or UK
				GDPR applies and personal data is transferred outside the EEA/UK, we
				rely on appropriate safeguards such as the European Commission's
				Standard Contractual Clauses (SCCs) or the UK International Data
				Transfer Agreement (or the UK Addendum to SCCs), as applicable.
			</p>
			<ul>
				<li>
					<strong>Cloudflare:</strong>{" "}
					<a
						href="https://www.cloudflare.com/cloudflare-customer-dpa/"
						target="_blank"
						rel="noopener noreferrer"
						className="text-hyper-green hover:underline"
					>
						Customer DPA
					</a>
				</li>
				<li>
					<strong>Stripe:</strong>{" "}
					<a
						href="https://stripe.com/legal/dpa"
						target="_blank"
						rel="noopener noreferrer"
						className="text-hyper-green hover:underline"
					>
						Data Processing Agreement
					</a>
				</li>
				<li>
					<strong>Resend:</strong>{" "}
					<a
						href="https://resend.com/legal/data-processing-agreement"
						target="_blank"
						rel="noopener noreferrer"
						className="text-hyper-green hover:underline"
					>
						Data Processing Agreement
					</a>
				</li>
				<li>
					<strong>Intercom:</strong>{" "}
					<a
						href="https://www.intercom.com/legal/data-processing-agreement"
						target="_blank"
						rel="noopener noreferrer"
						className="text-hyper-green hover:underline"
					>
						Data Processing Agreement
					</a>
				</li>
			</ul>
			<p>
				Ration Operating Company is established in the United States. We have
				not designated a formal EU/EEA representative under GDPR Article 27 at
				this time. If you have questions or wish to exercise your rights, please
				contact us directly at{" "}
				<a href="mailto:legal@mayutic.com">legal@mayutic.com</a>.
			</p>

			<h2>11. Data Retention & Deletion</h2>
			<p>
				We will retain your Personal Data only for as long as is necessary for
				the purposes set out in this Privacy Policy. We will retain and use your
				Personal Data to the extent necessary to comply with our legal
				obligations, resolve disputes, and enforce our legal agreements and
				policies.
			</p>
			<p>
				<strong>Right to be Forgotten:</strong> You have the right to request
				the deletion of your account and all associated data. Upon such request,
				we will permanently purge your Personal Data, Usage Data, Cargo Data,
				and Visual Data from our systems (D1 Databases, Vectorize Indexes, R2
				Storage). You can initiate this process through the "Purge Account"
				function in your profile settings.
			</p>
			<p>
				<strong>Third-party support records:</strong> Data held in Intercom
				(e.g. support conversations and contact records tied to your user id) is
				retained under Intercom&apos;s policies and product settings, which may
				differ from our purge timelines for Ration systems. After you delete
				your Ration account, you may contact us at{" "}
				<a href="mailto:legal@mayutic.com">legal@mayutic.com</a> to request that
				we coordinate deletion or suppression of your Intercom profile where
				applicable.
			</p>
			<p>
				<strong>Groups you own:</strong> For groups where other members have
				joined, ownership is automatically transferred to an admin or member
				when you delete your account. If you are the sole member (including when
				invitations are pending and not yet accepted), the group and all its
				data are permanently deleted. You may use the "Transfer ownership"
				option in group settings to hand off a group to another member before
				deleting your account.
			</p>
			<p>
				<strong>Shared groups:</strong> Inventory and meal data you have
				contributed to shared groups you do not solely own may be retained as
				part of that group's collective data, as it is also associated with
				other members.
			</p>

			<h2>12. Data Breach Notification</h2>
			<p>
				In the event of a personal data breach that is likely to result in a
				risk to your rights and freedoms, we will notify the relevant
				supervisory authority without undue delay and, where feasible, within 72
				hours of becoming aware of the breach (GDPR Art. 33). Where a breach is
				likely to result in a high risk to your rights and freedoms, we will
				also notify you directly without undue delay (GDPR Art. 34).
			</p>

			<h2>13. Security of Data</h2>
			<p>
				The security of your data is important to us, but remember that no
				method of transmission over the Internet, or method of electronic
				storage is 100% secure. While we strive to use commercially acceptable
				means to protect your Personal Data, we cannot guarantee its absolute
				security.
			</p>

			<h2>14. California Privacy Rights (CCPA / CPRA)</h2>
			<p>
				If you are a resident of California, you have specific rights under the
				California Consumer Privacy Act (CCPA) and the California Privacy Rights
				Act (CPRA):
			</p>
			<ul>
				<li>
					<strong>Right to Know:</strong> You may request information about the
					categories and specific pieces of personal information we have
					collected, the purposes for which it is used, and the categories of
					third parties with whom it is shared.
				</li>
				<li>
					<strong>Right to Delete:</strong> You may request deletion of personal
					information we have collected, subject to certain exceptions.
				</li>
				<li>
					<strong>Right to Correct:</strong> You may request correction of
					inaccurate personal information.
				</li>
				<li>
					<strong>Right to Opt-Out:</strong>{" "}
					<strong>We do not sell or share your personal information</strong> for
					cross-context behavioural advertising. No opt-out action is required.
				</li>
				<li>
					<strong>Right to Non-Discrimination:</strong> We will not discriminate
					against you for exercising any of these rights.
				</li>
			</ul>
			<p>
				To exercise your California privacy rights, contact us at{" "}
				<a href="mailto:legal@mayutic.com">legal@mayutic.com</a>. We will
				respond within 45 days of receiving a verifiable request.
			</p>

			<h2>15. Changes to This Privacy Policy</h2>
			<p>
				We may update our Privacy Policy from time to time. We will notify you
				of any changes by posting the new Privacy Policy on this page. You are
				advised to review this Privacy Policy periodically for any changes.
				Changes to this Privacy Policy are effective when they are posted on
				this page.
			</p>

			<h2>16. Contact Us & Data Subject Rights</h2>
			<p>
				If you have any questions about this Privacy Policy, or wish to exercise
				your rights under applicable data protection law (including the right to
				access, rectification, erasure, restriction, portability, or to object
				to processing), please contact us:
			</p>
			<ul>
				<li>
					By email: <a href="mailto:legal@mayutic.com">legal@mayutic.com</a>
				</li>
			</ul>
			<p>
				We will acknowledge and respond to all data subject rights requests
				within <strong>30 days</strong> of receipt, in accordance with GDPR
				Article 12. Account deletion can also be initiated directly via the
				"Purge Account" function in your profile settings.
			</p>
			<p>
				<strong>Right to lodge a complaint (GDPR Art. 77):</strong> You have the
				right to lodge a complaint with a supervisory authority. If you are in
				the EU or EEA, you may contact your local Data Protection Authority. A
				list of EU supervisory authorities is available at{" "}
				<a
					href="https://edpb.europa.eu/about-edpb/about-edpb/members_en"
					target="_blank"
					rel="noopener noreferrer"
					className="text-hyper-green hover:underline"
				>
					edpb.europa.eu
				</a>
				. If you are in the United Kingdom, you may contact the Information
				Commissioner's Office (ICO) at{" "}
				<a
					href="https://ico.org.uk"
					target="_blank"
					rel="noopener noreferrer"
					className="text-hyper-green hover:underline"
				>
					ico.org.uk
				</a>
				.
			</p>
		</>
	);
}
