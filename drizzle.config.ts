import type { Config } from "drizzle-kit";

export default {
	schema: "./app/db/schema.ts",
	out: "./drizzle",
	dialect: "sqlite",
	driver: "d1-http",
	dbCredentials: {
		accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
		databaseId: "da0bd1c3-9053-44a0-b926-5529d78ce34c",
		token: process.env.CLOUDFLARE_API_TOKEN ?? "",
	},
} satisfies Config;
