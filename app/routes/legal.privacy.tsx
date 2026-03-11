import { canonicalMeta, ogMeta } from "~/lib/seo";
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

export default function PrivacyPolicy() {
	return (
		<>
			<h1>Privacy Policy</h1>
			<p className="text-sm text-muted mb-8 glass-panel rounded-lg p-4">
				Last Updated: March 11, 2026
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

			<h2>4. How We Use Your Information</h2>
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

			<h2>5. Legal Basis for Processing (EU / UK Users)</h2>
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

			<h2>6. Magic Link Authentication</h2>
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

			<h2>7. Google User Data</h2>
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

			<h2>8. Data Processors & Third Parties</h2>
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
					<strong>
						AI Providers (e.g., OpenAI, Meta Llama via Cloudflare Workers AI):
					</strong>{" "}
					We use these services to process text and images. Your Visual Data is
					processed to identify items and is not used by us to train these
					models.
				</li>
			</ul>

			<h2>9. Data Retention & Deletion</h2>
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
				Storage). You can initiate this process through the specific "Purge
				Account" function in the User Profile settings.
			</p>

			<h2>10. Security of Data</h2>
			<p>
				The security of your data is important to us, but remember that no
				method of transmission over the Internet, or method of electronic
				storage is 100% secure. While we strive to use commercially acceptable
				means to protect your Personal Data, we cannot guarantee its absolute
				security.
			</p>

			<h2>11. Changes to This Privacy Policy</h2>
			<p>
				We may update our Privacy Policy from time to time. We will notify you
				of any changes by posting the new Privacy Policy on this page. You are
				advised to review this Privacy Policy periodically for any changes.
				Changes to this Privacy Policy are effective when they are posted on
				this page.
			</p>

			<h2>12. Contact Us & Data Subject Rights</h2>
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
		</>
	);
}
