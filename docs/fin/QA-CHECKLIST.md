# Fin / Intercom QA checklist

Use after importing articles into **Intercom** (or your Fin knowledge source). Paste each question into Fin preview; the answer should agree with the cited article and the **live app**.

## Publishing (manual)

1. Create Intercom **collections** A–G per [README.md](./README.md).
2. Import each `docs/fin/*.md` article (or paste Markdown). Set the **title** from [INDEX.md](./INDEX.md).
3. Tag **Audience** (Support / Sales) as needed for internal filters.
4. Restrict Fin to these collections so unrelated docs do not pollute answers.

## Golden questions (sample)

### Overview

- What is Ration?
- What is Cargo vs Galley?

### Auth & groups

- How do I switch households?
- Do credits belong to me or the family?

### Flows

- How do I add pantry items?
- How much does receipt scan cost?
- How do I import a recipe from a website?
- What does Update list do on Supply?

### Billing

- Why can’t I invite my partner?
- Does MCP use my AI credits?
- What is WELCOME65?
- Am I subscribed? When does my Crew Member plan renew?
- Cancel my subscription (Fin should confirm, then cancel **at period end** only).
- Am I set to cancel? How do I undo cancellation before the period ends?

### MCP / API

- What is the MCP hostname?
- Why is my MCP client failing with connection closed?
- List MCP tools that write to supply.
- Can I scan a receipt via MCP?

### Security / privacy

- Where is the privacy policy?
- How do I delete my account?

### Architecture / limits

- Why is my scan still processing?
- How many MCP read calls can I make per minute?

### Troubleshooting

- I paid but I don’t see credits.
- Duplicate URL when importing a recipe.

## Pass criteria

- Fin cites or paraphrases the **correct** article without inventing features.
- Numeric facts (**credits**, **tier limits**, **rate buckets**) match **Hub → Pricing** and this repo’s [README.md](../../README.md) at release time.

## When tests fail

1. Fix the **article** Markdown in `docs/fin/`.
2. Re-import or sync to Intercom.
3. Re-run the failed questions.

Record the Fin release date in your internal changelog (optional).
