---
name: legal-review
description: Legal and compliance review for Terms of Service, Privacy Policy, licensing, and regulatory compliance. Use when drafting legal documents, reviewing compliance, or ensuring data privacy requirements are met.
---

# Legal Review & Compliance

This skill provides guidance for legal and compliance matters in the Ration application.

## When to Use

Use this skill when:
- Drafting or reviewing Terms of Service
- Creating or updating Privacy Policy
- Ensuring GDPR/CCPA compliance
- Reviewing licensing requirements
- Auditing for PII exposure in code/logs

## Terms of Service (The Contract)

### Scope
- Clearly define the service ("Ration")
- Describe core functionality (pantry management, meal planning, etc.)

### User Obligations
- Prohibit abuse, reverse engineering, and illegal activities
- Define acceptable use policies
- Set expectations for user-generated content

### Liability
- Limit liability for data loss (especially for non-paying users)
- Disclaim service interruptions
- Define warranty limitations

### Payment Terms
- Align with Stripe's requirements regarding refunds, cancellations, and subscriptions
- Define credit purchase and usage terms
- Explain subscription billing cycles

## Privacy Policy (The Promise)

### Data Collection
Explicitly list all data collected:
- Scanning images (receipts, product photos)
- Pantry inventory data
- Dietary preferences and allergens
- User account information
- Usage analytics (if applicable)

### Data Processors
Disclose third-party data processors:

- **Cloudflare:** Infrastructure & Edge Compute
  - Data stored: Application data, images (R2), database (D1)
  - Purpose: Hosting and content delivery
- **Better Auth:** Authentication
  - Data stored: User credentials, session data
  - Purpose: User authentication and authorization
- **Stripe:** Payment processing
  - Data stored: Payment information (PCI compliant)
  - Purpose: Processing credit purchases and subscriptions
- **AI Providers (Cloudflare Workers AI):** Image processing
  - Data stored: Images for OCR/receipt parsing
  - Purpose: Product identification and inventory management
  - Note: No training on user data without explicit consent

### User Rights (GDPR)

- **Right to Access:** Users can request their data
- **Right to Rectification:** Users can correct inaccurate data
- **Right to Erasure (Right to be Forgotten):** Users can request deletion
  - Implementation: Must purge D1 records, Vectorize indexes, and R2 objects
  - See `security.mdc` rule for deletion requirements
- **Right to Data Portability:** Users can export their data
- **Right to Object:** Users can object to processing

### Data Retention
- Define how long data is retained
- Explain deletion policies
- Specify backup retention periods

## Licensing & IP

### Application License
- Assert proprietary rights over the "Ration" codebase
- Define open-source components (if any)
- Specify third-party library licenses

### Asset Rights
- Determine ownership of standard "Universal" pantry items vs User-generated content
- Define licensing for user-created recipes/meals
- Specify image rights (user-uploaded vs system-provided)

## Compliance Checklist

### GDPR Compliance
- [ ] Privacy Policy clearly explains data collection
- [ ] User rights are documented and accessible
- [ ] Right to deletion is implemented (see security rule)
- [ ] Data processing agreements with third parties
- [ ] Cookie consent mechanism (if using analytics)

### CCPA Compliance (if applicable)
- [ ] California residents' rights documented
- [ ] Opt-out mechanisms for data sale (if applicable)
- [ ] Disclosure of data categories collected

### Platform Policies
- [ ] Stripe Service Agreement compliance
- [ ] Cloudflare Acceptable Use Policy compliance
- [ ] Better Auth terms compliance (if applicable)

## Code Audit for PII Exposure

When reviewing code, check for:

- [ ] No PII in console.log statements
- [ ] No PII in error messages exposed to users
- [ ] No PII in URL parameters (use POST for sensitive data)
- [ ] No PII in telemetry/logging without sanitization
- [ ] Proper authentication checks before data access
- [ ] Row-level security enforced (user_id checks)

## Legal Document Locations

- Terms of Service: `app/routes/legal.tsx` (if implemented)
- Privacy Policy: `app/routes/legal.tsx` (if implemented)
- License: `LICENSE` file in project root

## Implementation Notes

- Legal documents should be accessible via `/legal` route
- Privacy Policy must be linked from signup/login flows
- Terms of Service acceptance should be required for account creation
- Regular review of legal documents (quarterly recommended)
- Consult with legal counsel for final review before publishing
