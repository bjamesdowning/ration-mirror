# Data, privacy, and deletion

## Canonical legal text

The binding policies are hosted on the product domain:

- **Terms of service:** `/legal/terms`
- **Privacy policy:** `/legal/privacy`

Open these paths on the **same host** you use for Ration (for example your production domain). This knowledge article **summarizes** common questions—it does **not** replace those pages.

## What Ration stores (plain language)

Typical categories include:

- **Account**: email, name, optional avatar image, auth-related records.
- **Organization data**: pantry items, recipes, meal plans, supply lists, credit balance, ledger entries.
- **AI features**: receipt images may be stored temporarily for processing; embeddings may be stored in a vector index scoped to your organization.
- **Billing**: Stripe customer and subscription metadata as needed to fulfill purchases.

Exact categories and legal bases are described in the **privacy policy**.

## Deletion (account purge)

When you **purge your account** from Settings (danger zone), Ration’s intent is to remove **your user record and associated personal data** from application databases and to clean up related artifacts (including vectors and objects tied to deletion flows). **Groups you solely own** may be deleted; shared groups may **transfer ownership** per in-app rules.

Follow **on-screen warnings**—deletion is meant to be **irreversible**.

## Data residency and subprocessors

Cloudflare, Stripe, email providers, and AI gateways may process data in their regions. See the **privacy policy** for subprocessors and international transfers.

## Contact

Use the **contact channel** listed in the privacy policy for privacy requests (access, correction, deletion) subject to verification.

If this summary and the legal pages disagree, the **legal pages win**.
