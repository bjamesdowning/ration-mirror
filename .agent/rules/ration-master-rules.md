---
trigger: always_on
---

# Project Ration: Master Protocol & Directives

## 1. Mission Profile
**Identity:** Ration is an "Orbital Supply Chain" pantry management system.
**Aesthetic:** "Brutalist Sci-Fi." High contrast (Neon Green #39FF14 on Void Dark #051105). Heads-Up Display (HUD) interfaces.
**Core Objective:** Zero-latency inventory tracking, AI-assisted logistical planning (recipes), and automated waste reduction.

## 2. Technology Stack (Strict Adherence, but always search and confirm the latest stable versions for each tool. Never use legacy tools)
* **Framework:** React Router v7.latest (Framework Mode / `routes.ts`).
* **Runtime:** Cloudflare Workers (V8 Isolates). **NO Node.js APIs (fs, net).**
* **Database:** Cloudflare D1 (SQLite) + Drizzle ORM.
* **Object Store: Cloudflare R2 (S3 Compatible)
* **Domain Zone Managment - DNS:** Cloudflare Domains
* **Vector Search:** Cloudflare Vectorize (Semantic Search).
* **Auth:** Better Auth - Edge compatible.
* **Styling:** Tailwind CSS v4.1.
* **Language:** TypeScript (Strict Mode).
* **Package Manager:** bun
* **Linting:** biome.
* **Payment Processing:** Stripe SDK

## 3. Functional Requirements (The "Manifest")
* **Core:** User bio-safety (allergens), unit calibration (metric/imperial), and inventory CRUD (Dry/Frozen taxonomy).
* **Ingest:** Bulk receipt parsing (OCR/LLM) and manual entry.
* **Intel:** Hybrid Search (D1 Boolean + Vectorize Semantic) and Visual Scanning (Llama 3 Vision).
* **Economy:** Credit-based ledger system. Scans cost credits; credits are purchasable via Stripe.
* **Admin:** "God Mode" dashboard for MRR and telemetry.

## 4. Non-Functional Directives (The "Physics")
* **Latency:** < 100ms interaction time. Edge-native logic.
* **Reliability:** Offline-first PWA. Read capabilities must function without network.
* **Cost:** Zero idle cost. No provisioned instances.
* **Security:** Strict Rate Limiting on AI endpoints to prevent billing drain.

## 5. Coding Standards
* **Architecture:** Monorepo. Feature-based folder structure.
* **Typing:** Strict Zod validation at the API boundary.
* **Linting:** Biome v1.9 (Rust-based).
* **Error Handling:** Graceful degradation. If AI fails, fallback to manual keyword search.