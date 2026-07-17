# Privacy Policy

## 1. Introduction

Mayutic ("we", "us", or "our") is the data controller for the Ration platform (the "Service"). This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our Service and the choices you have associated with that data.

**Mayutic**  
6 Dundrum Wood, Ballinteer Road, Dublin 16, D16 N2P7, Ireland  
Registered Business Name No. 777497  
Contact: [legal@mayutic.com](mailto:legal@mayutic.com)

## 2. Information We Collect

We collect several different types of information for various purposes to provide and improve our Service to you.

### Personal Data

While using our Service, we may ask you to provide us with certain personally identifiable information that can be used to contact or identify you ("Personal Data"). Personally identifiable information may include, but is not limited to:

- Email address (used for magic link sign-in and account identification)
- First name and last name
- Profile picture (via OAuth providers)
- Cookies and Usage Data
- Billing address (collected at checkout via Stripe for tax compliance; we do not store card details)

### Usage Data

We may also collect information on how the Service is accessed and used ("Usage Data"). This Usage Data may include information such as your computer's Internet Protocol address (e.g. IP address), browser type, browser version, the pages of our Service that you visit, the time and date of your visit, the time spent on those pages, unique device identifiers and other diagnostic data.

### Cargo & Visual Data

We collect data regarding items in your digital Cargo ("Cargo Data") and images you upload or scan for the purpose of item recognition ("Visual Data").

<!-- section:allergen -->
### Dietary & Allergen Data (Special Category)

> **Health Data — GDPR Article 9**
>
> Ration allows you to record dietary restrictions and allergens (e.g. gluten, nuts, dairy) to personalise meal recommendations and flag unsafe ingredients. Under GDPR Article 9, allergen data is considered **special category health data** because it may reveal information about your medical condition or physiological make-up.
>
> We process this data **only** on the basis of your **explicit consent (GDPR Art. 9(2)(a))** — specifically, the act of adding allergen information in your account settings. You may withdraw this consent at any time by removing your allergen selections. Allergen data is used solely to personalise your experience within the Service and is never shared with third parties for marketing purposes.
<!-- /section -->

## 3. Cookies

We use cookies strictly necessary for the operation of our Service and to provide functionality you request. Per GDPR Article 13(1)(f), we disclose each cookie below:

- **better-auth.session_token** — Authentication and session management. Set when you sign in (magic link or OAuth). Allows us to recognise you and keep you logged in. Expiry: session duration (e.g. 7 days). Essential; exempt from consent.
- **theme** — A functionality cookie that stores your light/dark mode preference. It is set only when you actively use the theme toggle or change your theme in settings; it is not set automatically on first visit. Expiry: 1 year. Functionality cookie set in response to user action; exempt from consent.

**Cloudflare Web Analytics** — We use Cloudflare Web Analytics to understand site performance. It does not use cookies and is privacy-preserving.

**Ration Copilot** — When you are signed in and use Ask Ration, your messages are processed by our first-party copilot running on Cloudflare Workers, Workers AI, Durable Objects, and AI Search. The copilot does not require a third-party messenger cookie.

## 4. Children's Privacy

Our Service is not directed to individuals under the age of 16 (or the applicable age of digital consent in your jurisdiction). We do not knowingly collect personal data from children. If you are a parent or guardian and believe your child has provided us with personal data, please contact us at [legal@mayutic.com](mailto:legal@mayutic.com) and we will delete that information promptly.

If you are located in the United States, our Service is also not intended for children under 13 in accordance with the Children's Online Privacy Protection Act (COPPA).

## 5. How We Use Your Information

Ration uses the collected data for various purposes:

- To provide and maintain the Service
- To notify you about changes to our Service
- To allow you to participate in interactive features of our Service when you choose to do so
- To provide customer care and support
- To provide analysis or valuable information so that we can improve the Service
- To monitor the usage of the Service
- To detect, prevent and address technical issues
- To process payments via our third-party payment processor

## 6. Legal Basis for Processing (EU / UK Users)

Where the General Data Protection Regulation (GDPR) or UK GDPR applies, we rely on the following lawful bases under Article 6 to process your personal data:

- **Performance of a contract (Art. 6(1)(b)):** Account creation, service delivery, inventory storage, meal planning, and visual scanning — processing necessary to provide the Service you have signed up for.
- **Legal obligation (Art. 6(1)(c)):** Payment records and transaction history retained to comply with applicable tax, VAT, and financial reporting laws, including obligations to Revenue in Ireland.
- **Legitimate interests (Art. 6(1)(f)):** Security monitoring, fraud prevention, and service improvement — where our interests do not override your rights and freedoms.

For allergen and dietary restriction data (special category data), we rely on your **explicit consent (GDPR Art. 9(2)(a))** as the legal basis. See Section 2 above.

## 7. Magic Link Authentication

> **Email-Based Sign-In**
>
> We offer passwordless sign-in via magic links. When you enter your email address, we send you a one-time sign-in link to that address. The link expires in 5 minutes and can only be used once. We use your email solely to deliver this link and to identify your account. The sign-in link is delivered via our transactional email provider (see Data Processors below).

## 8. Google User Data

> **Google OAuth Disclosure**
>
> Our application uses Google OAuth to allow you to sign in. When you use this feature, we access your Google account profile information, specifically your name, email address, and profile picture.
>
> **We do NOT sell this data.** We use this information solely for:
>
> - Authenticating your identity.
> - Creating and managing your user account.
> - Displaying your profile information within the application.
>
> We do not request or access any other Google user data (such as contacts, calendar, or drive files).

## 9. Data Processors & Third Parties

We may employ third party companies and individuals to facilitate our Service ("Service Providers"), to provide the Service on our behalf, to perform Service-related services or to assist us in analyzing how our Service is used.

### 9.1 AI Agents and MCP Connections

When you connect an MCP-compatible AI client (for example Claude, ChatGPT, or Cursor) via OAuth, you authorize that client to access your Ration kitchen data within the scopes you approve. The client vendor may process prompts and tool results on their systems; Ration does not control third-party retention. You can revoke access in Hub Settings → Connected Agents. OAuth grants are bound to a single household you select at authorization time.

These third parties have access to your Personal Data only to perform these tasks on our behalf and are obligated not to disclose or use it for any other purpose.

- **Cloudflare:** Infrastructure, edge computing, security, and transactional email delivery (Email Service). Data stored: application data, images (R2), database (D1). We use Cloudflare Email Service to send magic link sign-in, welcome, and verification emails. Your email address and message content are processed solely for delivery. See [Cloudflare's Privacy Policy](https://www.cloudflare.com/privacypolicy/).
- **Stripe:** Payment processing and billing address collection at checkout. We do not store or collect your payment card details. That information is provided directly to Stripe.
- **RevenueCat and Apple:** Subscription and in-app purchase management for the native iOS app. We share the Ration user id needed to map App Store purchases to your account, along with entitlement and transaction status metadata required to unlock paid features. Payment credentials are processed by Apple; Ration does not receive or store your App Store payment details.
- **Better Auth:** Authentication (session management, magic link verification, OAuth).
- **Cloudflare Workers AI, Durable Objects, and AI Search:** Ask Ration copilot inference, conversation state, and support-document retrieval. We process your copilot messages, relevant account and group context, and tool results needed to answer questions or make changes you request. Copilot analytics are aggregated and do not include message text or unnecessary personal data.
- **AI Providers (Google Gemini via Cloudflare AI Gateway):** We use Google Gemini (proxied via Cloudflare AI Gateway) to process the following categories of data:
  - **Visual Data** — receipt and product images you upload, encoded as base64 and sent to Gemini for item identification (Scan feature). Images are deleted from our storage immediately after processing.
  - **Inventory Data** — ingredient names and quantities from your Cargo, sent to Gemini to generate personalised meal suggestions.
  - **Allergen Profile** — your dietary restriction settings, sent alongside inventory data to ensure AI-generated meals exclude unsafe ingredients.
  - **Recipe URLs & Page Content** — web page content fetched from URLs you submit for recipe import, sent to Gemini for structured recipe extraction.

  Your data is not used to train these models. Processing is governed by Cloudflare's [AI Gateway terms](https://www.cloudflare.com/cloudflare-customer-dpa/) and [Google's Gemini API Terms](https://ai.google.dev/gemini-api/terms).
- **AI Providers — Cloudflare Workers AI (embedding model):** We use Cloudflare Workers AI (`@cf/google/embeddinggemma-300m`) to generate semantic vector embeddings from ingredient names. Vectors are stored in Cloudflare Vectorize for semantic matching. Embeddings are cached in KV for up to 7 days and deleted when you remove the item or purge your account. No personally identifiable information beyond ingredient name text is included in embedding requests.

## 10. International Data Transfers

Mayutic is established in Ireland at 6 Dundrum Wood, Ballinteer Road, Dublin 16, D16 N2P7, Ireland. Our Service Providers may process personal data in countries outside your country of residence, including the United States. Where GDPR or UK GDPR applies and personal data is transferred outside the EEA/UK, we rely on appropriate safeguards such as the European Commission's Standard Contractual Clauses (SCCs) or the UK International Data Transfer Agreement (or the UK Addendum to SCCs), as applicable.

- **Cloudflare:** [Customer DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)
- **Stripe:** [Data Processing Agreement](https://stripe.com/legal/dpa)

If you have questions or wish to exercise your rights, please contact us directly at [legal@mayutic.com](mailto:legal@mayutic.com).

## 11. Data Retention & Deletion

We will retain your Personal Data only for as long as is necessary for the purposes set out in this Privacy Policy. We will retain and use your Personal Data to the extent necessary to comply with our legal obligations, resolve disputes, and enforce our legal agreements and policies.

**Right to be Forgotten:** You have the right to request the deletion of your account and all associated data. Upon such request, we will permanently purge your Personal Data, Usage Data, Cargo Data, Visual Data, and copilot conversation state from our systems (D1 Databases, Vectorize Indexes, R2 Storage, and copilot Durable Objects). You can initiate this process through the "Purge Account" function in your profile settings.

**Groups you own:** For groups where other members have joined, ownership is automatically transferred to an admin or member when you delete your account. If you are the sole member (including when invitations are pending and not yet accepted), the group and all its data are permanently deleted. You may use the "Transfer ownership" option in group settings to hand off a group to another member before deleting your account.

**Shared groups:** Inventory and meal data you have contributed to shared groups you do not solely own may be retained as part of that group's collective data, as it is also associated with other members.

## 12. Data Breach Notification

In the event of a personal data breach that is likely to result in a risk to your rights and freedoms, we will notify the relevant supervisory authority without undue delay and, where feasible, within 72 hours of becoming aware of the breach (GDPR Art. 33). Where a breach is likely to result in a high risk to your rights and freedoms, we will also notify you directly without undue delay (GDPR Art. 34).

## 13. Security of Data

The security of your data is important to us, but remember that no method of transmission over the Internet, or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your Personal Data, we cannot guarantee its absolute security.

## 14. California Privacy Rights (CCPA / CPRA)

If you are a resident of California, you have specific rights under the California Consumer Privacy Act (CCPA) and the California Privacy Rights Act (CPRA):

- **Right to Know:** You may request information about the categories and specific pieces of personal information we have collected, the purposes for which it is used, and the categories of third parties with whom it is shared.
- **Right to Delete:** You may request deletion of personal information we have collected, subject to certain exceptions.
- **Right to Correct:** You may request correction of inaccurate personal information.
- **Right to Opt-Out:** **We do not sell or share your personal information** for cross-context behavioural advertising. No opt-out action is required.
- **Right to Non-Discrimination:** We will not discriminate against you for exercising any of these rights.

To exercise your California privacy rights, contact us at [legal@mayutic.com](mailto:legal@mayutic.com). We will respond within 45 days of receiving a verifiable request.

## 15. Changes to This Privacy Policy

We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page. You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.

## 16. Contact Us & Data Subject Rights

If you have any questions about this Privacy Policy, or wish to exercise your rights under applicable data protection law (including the right to access, rectification, erasure, restriction, portability, or to object to processing), please contact us:

- By email: [legal@mayutic.com](mailto:legal@mayutic.com)

We will acknowledge and respond to all data subject rights requests within **30 days** of receipt, in accordance with GDPR Article 12. Account deletion can also be initiated directly via the "Purge Account" function in your profile settings.

**Right to lodge a complaint (GDPR Art. 77):** You have the right to lodge a complaint with a supervisory authority. If you are in Ireland, you may contact the [Data Protection Commission (Ireland)](https://www.dataprotection.ie). If you are elsewhere in the EU or EEA, you may contact your local Data Protection Authority. A list of EU supervisory authorities is available at [edpb.europa.eu](https://edpb.europa.eu/about-edpb/about-edpb/members_en). If you are in the United Kingdom, you may contact the Information Commissioner's Office (ICO) at [ico.org.uk](https://ico.org.uk).
