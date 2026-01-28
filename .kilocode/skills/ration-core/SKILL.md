---
name: ration-core
description: Core project knowledge for Ration - the "Orbital Supply Chain" pantry management system. This skill provides the foundational technology stack, aesthetic principles, and coding standards that all other Ration skills build upon. Use this skill for ANY work on the Ration project to ensure strict adherence to the architecture and constraints.
---

# Ration: Master Protocol & Directives

## 1. Mission Profile

**Identity:** Ration is an "Orbital Supply Chain" pantry management system.
**Aesthetic:** "Brutalist Sci-Fi." High contrast (Neon Green #39FF14 on Void Dark #051105). Heads-Up Display (HUD) interfaces.
**Core Objective:** Zero-latency inventory tracking, AI-assisted logistical planning (recipes), and automated waste reduction.

## 2. Technology Stack (Strict Adherence)

Always search and confirm the latest stable versions for each tool. Never use legacy tools.

| Layer | Technology |
|-------|------------|
| **Framework** | React Router v7.latest (Framework Mode / `routes.ts`) |
| **Runtime** | Cloudflare Workers (V8 Isolates). **NO Node.js APIs (fs, net).** |
| **Database** | Cloudflare D1 (SQLite) + Drizzle ORM |
| **Object Store** | Cloudflare R2 (S3 Compatible) |
| **Domain/DNS** | Cloudflare Domains |
| **Vector Search** | Cloudflare Vectorize (Semantic Search) |
| **Auth** | Better Auth - Edge compatible |
| **Styling** | Tailwind CSS v4.1 |
| **Language** | TypeScript (Strict Mode) |
| **Package Manager** | bun |
| **Linting** | biome |
| **Payment** | Stripe SDK |

## 3. Functional Requirements (The "Manifest")

- **Core:** User bio-safety (allergens), unit calibration (metric/imperial), and inventory CRUD (Dry/Frozen taxonomy).
- **Ingest:** Bulk receipt parsing (OCR/LLM) and manual entry.
- **Intel:** Hybrid Search (D1 Boolean + Vectorize Semantic) and Visual Scanning (Llama 3 Vision).
- **Economy:** Credit-based ledger system. Scans cost credits; credits are purchasable via Stripe.
- **Admin:** "God Mode" dashboard for MRR and telemetry.

## 4. Non-Functional Directives (The "Physics")

- **Latency:** < 100ms interaction time. Edge-native logic.
- **Reliability:** Offline-first PWA. Read capabilities must function without network.
- **Cost:** Zero idle cost. No provisioned instances.
- **Security:** Strict Rate Limiting on AI endpoints to prevent billing drain.

## 5. Coding Standards

- **Architecture:** Monorepo. Feature-based folder structure.
- **Typing:** Strict Zod validation at the API boundary.
- **Linting:** Biome v1.9 (Rust-based).
- **Error Handling:** Graceful degradation. If AI fails, fallback to manual keyword search.

## 6. Design Language Reference

- **Colors:**
  - Void Dark: `#051105`
  - Neon Green: `#39FF14`
- **Shapes:** Chamfered corners. `border-1`. No rounded buttons (0px border-radius).
- **Mobile-First:** Design for the "Thumb Zone". Primary actions (Scan, Add) must be bottom-aligned.

## 7. File Organization

```
app/
├── components/
│   ├── cargo/        # Inventory-related UI
│   ├── dashboard/    # Dashboard layouts
│   ├── galley/       # Meal/recipe UI
│   ├── hud/          # Status displays
│   ├── scanner/      # Camera/scanning UI
│   ├── shell/        # Navigation shells
│   └── supply/       # Grocery/shopping UI
├── db/
│   └── schema.ts     # Drizzle schema (owned by @database)
├── lib/
│   ├── schemas/      # Zod validation schemas
│   └── *.server.ts   # Server-side utilities
└── routes/           # React Router routes
```
