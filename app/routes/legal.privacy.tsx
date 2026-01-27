// @ts-nocheck
import type { Route } from "./+types/legal.privacy";

export const meta: Route.MetaFunction = () => {
	return [
		{ title: "Privacy Policy | Ration" },
		{ name: "description", content: "Privacy Policy for the Ration platform." },
	];
};

export default function PrivacyPolicy() {
	return (
		<>
			<h1>Privacy Policy</h1>
			<p className="text-sm text-muted mb-8 glass-panel rounded-lg p-4">
				Last Updated: {new Date().toLocaleDateString()}
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
				<li>Email address</li>
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

			<h3>Inventory & Visual Data</h3>
			<p>
				We collect data regarding items in your digital pantry ("Inventory
				Data") and images you upload or scan for the purpose of item recognition
				("Visual Data").
			</p>

			<h2>3. How We Use Your Information</h2>
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

			<h2>4. Google User Data</h2>
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

			<h2>5. Data Processors & Third Parties</h2>
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
					<strong>Cloudflare:</strong> We use Cloudflare for infrastructure,
					edge computing, and security.
				</li>
				<li>
					<strong>Stripe:</strong> Payment processing services. We do not store
					or collect your payment card details. That information is provided
					directly to our third-party payment processors whose use of your
					personal information is governed by their Privacy Policy.
				</li>
				<li>
					<strong>Better Auth:</strong> Authentication services.
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

			<h2>6. Data Retention & Deletion</h2>
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
				we will permanently purge your Personal Data, Usage Data, Inventory
				Data, and Visual Data from our systems (D1 Databases, Vectorize Indexes,
				R2 Storage). You can initiate this process through the specific "Purge
				Account" function in the User Profile settings.
			</p>

			<h2>7. Security of Data</h2>
			<p>
				The security of your data is important to us, but remember that no
				method of transmission over the Internet, or method of electronic
				storage is 100% secure. While we strive to use commercially acceptable
				means to protect your Personal Data, we cannot guarantee its absolute
				security.
			</p>

			<h2>8. Changes to This Privacy Policy</h2>
			<p>
				We may update our Privacy Policy from time to time. We will notify you
				of any changes by posting the new Privacy Policy on this page. You are
				advised to review this Privacy Policy periodically for any changes.
				Changes to this Privacy Policy are effective when they are posted on
				this page.
			</p>

			<h2>9. Contact Us</h2>
			<p>
				If you have any questions about this Privacy Policy, please contact us:
			</p>
			<ul>
				<li>
					By email: <a href="mailto:legal@mayutic.com">legal@mayutic.com</a>
				</li>
			</ul>
		</>
	);
}
