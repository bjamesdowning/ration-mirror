import type { Route } from "./+types/legal.terms";

export const meta: Route.MetaFunction = () => {
	return [
		{ title: "Terms of Service | Ration" },
		{
			name: "description",
			content: "Terms of Service for the Ration platform.",
		},
	];
};

export default function TermsOfService() {
	return (
		<>
			<h1>Terms of Service</h1>
			<p className="text-sm text-muted mb-8 glass-panel rounded-lg p-4">
				Last Updated: February 3, 2026
			</p>

			<h2>1. Acceptance of Terms</h2>
			<p>
				By accessing or using the Ration platform ("Service"), you agree to be
				bound by these Terms of Service ("Terms"). If you disagree with any part
				of the terms, you may not access the Service. The Service is operated by
				Ration Operating Company ("Company", "we", "us", or "our").
			</p>

			<h2>2. Description of Service</h2>
			<p>
				Ration is a smart Cargo management system designed to track inventory,
				facilitate meal planning, and reduce waste. Our services include:
			</p>
			<ul>
				<li>Inventory tracking and management</li>
				<li>AI-assisted meal generation and meal planning</li>
				<li>Visual scanning and item recognition</li>
				<li>Free visual scanning utilizing third-party AI providers</li>
			</ul>

			<h2>3. User Accounts & Security</h2>
			<p>
				You are responsible for maintaining the confidentiality of your account
				credentials. You agree to accept responsibility for all activities that
				occur under your account. You must notify us immediately upon becoming
				aware of any breach of security or unauthorized use of your account.
			</p>

			<h2>4. User Conduct</h2>
			<p>You agree not to use the Service:</p>
			<ul>
				<li>
					In any way that violates any applicable national or international law
					or regulation.
				</li>
				<li>
					To exploit, harm, or attempt to exploit or harm minors in any way.
				</li>
				<li>
					To transmit, or procure the sending of, any advertising or promotional
					material, including any "junk mail", "chain letter," "spam," or any
					other similar solicitation.
				</li>
				<li>
					To impersonate or attempt to impersonate the Company, a Company
					employee, another user, or any other person or entity.
				</li>
				<li>
					To engage in any other conduct that restricts or inhibits anyone's use
					or enjoyment of the Service, or which, as determined by us, may harm
					the Company or users of the Service, or expose them to liability.
				</li>
				<li>
					<strong>Specifically:</strong> You explicitly agree not to abuse or
					attempt to reverse-engineer our AI endpoints or credit system.
				</li>
			</ul>

			<h2>5. Intellectual Property</h2>
			<p>
				The Service and its original content (excluding Content provided by
				users), features, and functionality are and will remain the exclusive
				property of Ration Operating Company and its licensors. The Service is
				protected by copyright, trademark, and other laws of both the United
				States and foreign countries. Our trademarks and trade dress may not be
				used in connection with any product or service without the prior written
				consent of Ration Operating Company.
			</p>

			<h2>6. Termination</h2>
			<p>
				We may terminate or suspend your account and bar access to the Service
				immediately, without prior notice or liability, under our sole
				discretion, for any reason whatsoever and without limitation, including
				but not limited to a breach of the Terms. If you wish to terminate your
				account, you may simply discontinue using the Service.
			</p>

			<h2>7. Disclaimer</h2>
			<p>
				Your use of the Service is at your sole risk. The Service is provided on
				an "AS IS" and "AS AVAILABLE" basis. The Service is provided without
				warranties of any kind, whether express or implied, including, but not
				limited to, implied warranties of merchantability, fitness for a
				particular purpose, non-infringement, or course of performance.
			</p>
			<p>
				Ration Operating Company uses third-party AI providers for certain
				features. We do not guarantee the accuracy, completeness, or reliability
				of any AI-generated content or analysis.
			</p>

			<h2>8. Limitation of Liability</h2>
			<p>
				In no event shall Ration Operating Company, nor its directors,
				employees, partners, agents, suppliers, or affiliates, be liable for any
				indirect, incidental, special, consequential or punitive damages,
				including without limitation, loss of profits, data, use, goodwill, or
				other intangible losses, resulting from (i) your access to or use of or
				inability to access or use the Service; (ii) any conduct or content of
				any third party on the Service; (iii) any content obtained from the
				Service; and (iv) unauthorized access, use or alteration of your
				transmissions or content, whether based on warranty, contract, tort
				(including negligence) or any other legal theory, whether or not we have
				been informed of the possibility of such damage, and even if a remedy
				set forth herein is found to have failed of its essential purpose.
			</p>

			<h2>9. Governing Law</h2>
			<p>
				These Terms shall be governed and construed in accordance with the laws
				of Delaware, United States, without regard to its conflict of law
				provisions.
			</p>

			<h2>10. Changes</h2>
			<p>
				We reserve the right, at our sole discretion, to modify or replace these
				Terms at any time. If a revision is material we will provide at least 30
				days notice prior to any new terms taking effect. What constitutes a
				material change will be determined at our sole discretion.
			</p>

			<h2>11. Contact Us</h2>
			<p>
				If you have any questions about these Terms, please contact us at:{" "}
				<a href="mailto:legal@mayutic.com">legal@mayutic.com</a>
			</p>
		</>
	);
}
