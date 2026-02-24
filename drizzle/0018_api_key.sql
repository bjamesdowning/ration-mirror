CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"name" text NOT NULL,
	"scopes" text NOT NULL,
	"last_used_at" integer,
	"created_at" integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "api_key_prefix_idx" ON "api_key" ("key_prefix");
--> statement-breakpoint
CREATE INDEX "api_key_org_idx" ON "api_key" ("organization_id");
