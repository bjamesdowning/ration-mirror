import type { Config } from "drizzle-kit";

export default {
	schema: "./app/db/schema.ts",
	out: "./drizzle",
	dialect: "sqlite",
	driver: "d1-http",
	dbCredentials: {
		accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
		databaseId: "b7c25126-5389-4977-be8e-04f08535560c",
		token: process.env.CLOUDFLARE_API_TOKEN!,
	},
} satisfies Config;
