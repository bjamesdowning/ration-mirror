```mermaid
flowchart TB
    subgraph Internet["🌐 Internet"]
        User["👤 User<br/>Browser/PWA"]
    end

    subgraph CloudflareDNS["☁️ Cloudflare DNS (mayutic.com)"]
        DNS["DNS Zone<br/>mayutic.com"]
        CustomDomain["CNAME Record<br/>ration.mayutic.com"]
    end

    subgraph CloudflareEdge["⚡ Cloudflare Edge Network"]
        CDN["Global CDN<br/>SSL/TLS Termination"]
        SmartPlacement["Smart Placement<br/>Auto-routing"]
    end

    subgraph CloudflareWorker["🔧 Cloudflare Worker: ration"]
        direction TB
        Worker["workers/app.ts<br/>ExportedHandler&lt;Env&gt;"]
        ReactRouter["React Router v7<br/>SSR + Client Hydration"]
        BetterAuth["Better Auth<br/>Session Management"]
        DrizzleORM["Drizzle ORM<br/>Type-safe Queries"]
        
        Worker --> ReactRouter
        ReactRouter --> BetterAuth
        ReactRouter --> DrizzleORM
    end

    subgraph CloudflareStorage["💾 Cloudflare Storage Services"]
        D1[("D1 Database<br/>ration-db<br/>binding: DB<br/>SQLite")]
        R2[("R2 Bucket<br/>ration-storage<br/>binding: STORAGE")]
        KV[("KV Namespace<br/>RATION_KV<br/>Session/Cache")]
        Assets["Static Assets<br/>./build/client<br/>binding: ASSETS"]
    end

    subgraph CloudflareAI["🤖 Cloudflare AI"]
        WorkersAI["Workers AI<br/>binding: AI<br/>LLM Inference"]
    end

    subgraph CloudflareObservability["📊 Observability"]
        Logs["Worker Logs<br/>Real-time Traces"]
    end

    subgraph ExternalAuth["🔐 OAuth Providers"]
        Google["Google OAuth 2.0<br/>GOOGLE_CLIENT_ID<br/>GOOGLE_CLIENT_SECRET"]
    end

    subgraph ExternalPayments["💳 Payment Processing"]
        Stripe["Stripe API<br/>STRIPE_SECRET_KEY"]
        StripeWebhook["Stripe Webhooks<br/>STRIPE_WEBHOOK_SECRET<br/>/api/webhook"]
    end

    subgraph Secrets["🔑 Secrets (wrangler secret)"]
        direction LR
        S1["BETTER_AUTH_SECRET"]
        S2["STRIPE_SECRET_KEY"]
        S3["STRIPE_WEBHOOK_SECRET"]
        S4["GOOGLE_CLIENT_ID"]
        S5["GOOGLE_CLIENT_SECRET"]
        S6["ADMIN_EMAILS"]
    end

    %% Connection flows
    User -->|"HTTPS Request"| DNS
    DNS --> CustomDomain
    CustomDomain -->|"custom_domain: true"| CDN
    CDN --> SmartPlacement
    SmartPlacement -->|"mode: smart"| Worker

    Worker -->|"binding: DB"| D1
    Worker -->|"binding: STORAGE"| R2
    Worker -->|"binding: RATION_KV"| KV
    Worker -->|"binding: ASSETS"| Assets
    Worker -->|"binding: AI"| WorkersAI
    Worker -->|"observability: enabled"| Logs

    BetterAuth -->|"OAuth Flow"| Google
    ReactRouter -->|"Checkout Session"| Stripe
    Stripe -->|"POST /api/webhook"| StripeWebhook
    StripeWebhook -->|"Verify & Process"| Worker

    Secrets -.->|"Runtime Injection"| Worker

    %% Styling
    classDef cloudflare fill:#f6821f,stroke:#333,stroke-width:2px,color:#fff
    classDef storage fill:#1e88e5,stroke:#333,stroke-width:2px,color:#fff
    classDef external fill:#4caf50,stroke:#333,stroke-width:2px,color:#fff
    classDef secrets fill:#9c27b0,stroke:#333,stroke-width:2px,color:#fff
    classDef user fill:#607d8b,stroke:#333,stroke-width:2px,color:#fff

    class Worker,ReactRouter,BetterAuth,DrizzleORM,CDN,SmartPlacement cloudflare
    class D1,R2,KV,Assets,WorkersAI storage
    class Google,Stripe,StripeWebhook external
    class S1,S2,S3,S4,S5,S6 secrets
    class User user
```

[🎨 View/Edit Live Diagram on Mermaid.ai](https://mermaid.ai/live/edit?utm_source=mermaid_mcp_server&utm_medium=remote_server&utm_campaign=claude#pako:eNqdVt1uGkcUfpURUSxHXcDg35Iq0gJbGxkD2d3YakOFZncH2HrZoTODMal70duqUpM2qqreRJUi9QF606s-TF-geYTOHzCLCULmAs05-50zZ87PN_NtLsQRylVy_QRPwyEkDPjVbgr4j06CAYHjIWikDJEUsZfd3Id3P75eyN3cVwopfi8oIhLw5r1cfxaQ4rMqwVO-Lnau7AUYpVE3XdmhluBJ1E8gQfWWx738-9v3__39k6EGXA92R3A2YXFYCPHoSWZzZSUwX-IUya0NbAZam1CGR3U8gnHKbWot-8IBLgoxiaQdgSzGaWGd-ebInWiAROi__2HGLbSghdgUk-tsHPUWR58mOICJEOTmntcs-k0P-IiM4lRGkjHyRrxAnQSGaIRSUQ-pAAuNdGJPGM4TzMNPB1vGfsWj0-V7-6cZvvpQAeR-LFFMUCi0i4YRv4WnqVzQIhyPC4zKwJzbMSYMRWcwjRJEdhL21Elvdgbsacaxi2DIXB6_9CMloERwc6zT5IJPeJgxPzI4m0Vroqsixg14KobchxKAkJQ9olQEfgFTOJCJy3YTiV-9SlDbvRBNpQTAJWnrz8YoT2EfgecTRGJEM6ariQD5_DPzQGtPKUHLgD-OWQa2TVE9hgmUPfnh3c__mFXVX4CHyE0crhyhXnq5y49dAnXIYAApMsYiHwVSCuI04t1VAfWqSujzZsxQN_fELGNZ-HHLoDoJrxEzvVC1f9aV57dd-9TJOjm_FE7OL0ELjhAd8zaXRq7tN9qt3vmlWc5iDYbDlSBsShGjYlAY3zrUsrQqFINJnETFULZRNhbb8xzf23J47IZM8ftfzRTbjUxSVTdQCdVrDlnZVMnN5gVn2D4iKA3RliG0A86yNzCIk5jNZDS__AAyykw0TTygi0CkpLKKYJJn8QgBn0CzLdZt7tyKSwAmesQ4cbwGbSGADsE3ccRPmNnzFONBIppRLTS2XNiTW5-226dNp1drNpyW32vU1yg9p-Y6_lYxdeBMDDVVrf8X0LKILBS9YvCiZFVG4jGSTSIWwO6oSni-2-g4euPeufPFGqsrFAwxvl4aawU1PVw51bN2-1x7kl84L8bFqcJuPJOHQoL0Ud6-mYtgd0pgyvNIAJWaJx_h5qZrRFwSXOj4vuP27Bf-2WpKJaYsjrL54PtLSPZkWdiBKPZKXbOIw3uIdX6OOMquXzRaPefCbjTXjuXjx6CG01QfWrxlqPogniKCO--6uTPf73icU7-ZIMoJ_068GhRIPBwEv5pvA_XF1Gg3oVT1IqmrAEYmSDjjV7g2qbeks-xdrb5lddrhiD_AKoCKT8KRmsr5wZbXCEcatCvjL23CLPj0jlPxJuCCTAWU_2-AznnxThPpRmxjeRpOfGug2CSoCi8nDBIUCStBSfMMLC9GbaaY43NeYwFVdKKgK_clx9aGKLzmCqDvCGGhBlUXRA2tAnfang-yg3mXHXPTSKu07SV_C_RnYGfOMfcrOZ_cfEEauJNUUm0j_Vp17X0L3tQemyWCrqQcJpDSOurzxeKe6cdJUnnUPzopl_oWZQRfo8qj_f19vc5P44gNK-XxrRXiBBMO7fdXvOnbWLsqoZMTdPhAV0gTsPZ1EML-4d5Dw9L5Uq4-DcvHwUNdTQQJKD9He8fRSbC9H8OTro5ldJm1bE5r-TizOAVYK6O-LJnpsV6y3LJ1fmmpcbIW0zIviglWnW6p7rOyTThPvIn3SpZXtrx9yzuwvEPLO5qn1ARJfhT5yX33P_vamic)

> **Architecture:** React Router v7 (SSR) + Drizzle ORM + Better Auth | **Platform:** Cloudflare Workers | **Domain:** `ration.mayutic.com`

## Security Architecture Diagrams

### API Request Flow

```mermaid
sequenceDiagram
    participant UserBrowser as "UserBrowser"
    participant EdgeWorker as "EdgeWorker"
    participant AuthService as "BetterAuth"
    participant RateLimiter as "RateLimiterKV"
    participant CreditLedger as "CreditLedger"
    participant D1DB as "D1Database"
    participant WorkersAI as "WorkersAI"

    UserBrowser->>EdgeWorker: HTTPS request
    EdgeWorker->>AuthService: getSession(headers)
    AuthService-->>EdgeWorker: session or null
    EdgeWorker->>RateLimiter: checkRateLimit(userId)
    RateLimiter-->>EdgeWorker: allowed or blocked
    EdgeWorker->>CreditLedger: checkBalance(groupId)
    CreditLedger->>D1DB: read organization credits
    D1DB-->>CreditLedger: credits
    EdgeWorker->>WorkersAI: run model (scan or generate)
    WorkersAI-->>EdgeWorker: AI output
    EdgeWorker->>CreditLedger: deductCredits(groupId, cost)
    CreditLedger->>D1DB: update credits and insert ledger
    D1DB-->>CreditLedger: write result
    EdgeWorker-->>UserBrowser: JSON response
```

### Database Schema

```mermaid
erDiagram
    user ||--o{ session : has
    user ||--o{ account : has
    user ||--o{ member : joins
    user ||--o{ invitation : invites
    organization ||--o{ member : includes
    organization ||--o{ inventory : owns
    organization ||--o{ meal : owns
    organization ||--o{ activeMealSelection : selects
    organization ||--o{ groceryList : owns
    organization ||--o{ ledger : has
    meal ||--o{ mealIngredient : has
    meal ||--o{ mealTag : has
    meal ||--o{ activeMealSelection : selected
    groceryList ||--o{ groceryItem : contains
    groceryItem }o--|| meal : sourceMeal
    mealIngredient }o--|| inventory : uses
```

### Payment And Credit Flow

```mermaid
sequenceDiagram
    participant UserBrowser as "UserBrowser"
    participant EdgeWorker as "EdgeWorker"
    participant StripeAPI as "StripeAPI"
    participant StripeWebhook as "StripeWebhook"
    participant IdempotencyKV as "IdempotencyKV"
    participant CreditLedger as "CreditLedger"
    participant D1DB as "D1Database"

    UserBrowser->>EdgeWorker: POST /api/checkout
    EdgeWorker->>StripeAPI: create checkout session
    StripeAPI-->>EdgeWorker: client_secret
    UserBrowser->>StripeAPI: complete payment
    StripeAPI-->>StripeWebhook: webhook event
    StripeWebhook->>IdempotencyKV: check processed event
    IdempotencyKV-->>StripeWebhook: alreadyProcessed or not
    StripeWebhook->>EdgeWorker: processCheckoutSession
    EdgeWorker->>CreditLedger: addCredits(orgId, credits)
    CreditLedger->>D1DB: update credits and insert ledger
    D1DB-->>CreditLedger: write result
```

### Route Access Control Map

```mermaid
flowchart TB
    Routes["Routes"] --> PublicRoutes["PublicRoutes"]
    Routes --> AuthRoutes["AuthRoutes"]
    Routes --> GroupRoutes["GroupRoutes"]
    Routes --> AdminRoutes["AdminRoutes"]

    PublicRoutes --> Home["/"]
    PublicRoutes --> Shared["/shared/:token"]
    PublicRoutes --> Legal["/legal/*"]
    PublicRoutes --> AuthApi["/api/auth/*"]
    PublicRoutes --> Webhook["/api/webhook"]

    AuthRoutes --> SelectGroup["/select-group"]
    AuthRoutes --> GroupCreate["/api/groups/create"]
    AuthRoutes --> UserPurge["/api/user/purge"]

    GroupRoutes --> Dashboard["/dashboard/*"]
    GroupRoutes --> Meals["/api/meals/*"]
    GroupRoutes --> Inventory["/api/inventory/*"]
    GroupRoutes --> Grocery["/api/grocery-lists/*"]
    GroupRoutes --> Scan["/api/scan"]
    GroupRoutes --> Search["/api/search"]
    GroupRoutes --> Checkout["/api/checkout"]

    AdminRoutes --> Admin["/admin"]
```