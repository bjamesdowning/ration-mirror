import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { createGroceryListFromAllMeals } from "./grocery.server";
import type { UserSettings } from "./types";

/**
 * Checks if a new grocery list should be generated for the user based on their settings.
 * If yes, generates it and updates the lastGeneratedAt timestamp.
 * This is designed to be called "lazily" when the user visits the dashboard.
 */
export async function checkAndGenerateList(
	context: { cloudflare: { env: Env } },
	userId: string,
) {
	const db = drizzle(context.cloudflare.env.DB, { schema });

	// Fetch user settings
	const user = await db.query.user.findFirst({
		where: (user, { eq }) => eq(user.id, userId),
		columns: {
			settings: true,
		},
	});

	if (!user) return null;

	const settings = (user.settings as UserSettings) || {};
	const generationConfig = settings.listGeneration;

	// If automation is off, do nothing
	if (!generationConfig || generationConfig.frequency === "off") {
		return null;
	}

	const now = new Date();
	const lastGenerated = generationConfig.lastGeneratedAt
		? new Date(generationConfig.lastGeneratedAt)
		: null;

	let shouldGenerate = false;
	let listName = "";

	// Determine if we need to generate based on frequency
	if (!lastGenerated) {
		// First time run
		shouldGenerate = true;
	} else {
		// Logic: If it's been MORE than the interval since last generation
		// For "daily", we check if the date has changed or 24h passed?
		// Simple approach: Check if "today" is different from "last generated day" for daily
		// Or use intervalDays for all.

		let interval = 0;
		if (generationConfig.frequency === "daily") interval = 1;
		else if (generationConfig.frequency === "weekly") interval = 7;
		else if (generationConfig.frequency === "custom")
			interval = generationConfig.intervalDays || 1;

		// If distinct days passed >= interval
		// Using a simple milliseconds check might be safer for "24 hours"
		// But usually "Daily" means "A new one for today".
		// Let's use flexible day difference.
		// If last generated was Yesterday (1 day ago) and interval is 1 (Daily), do we generate? Yes.
		// If last generated was Today (0 days ago), do we? No.

		// We need a precise check.
		const msPerDay = 1000 * 60 * 60 * 24;
		const daysSinceLast = (now.getTime() - lastGenerated.getTime()) / msPerDay;

		if (daysSinceLast >= interval) {
			shouldGenerate = true;
		}
	}

	if (!shouldGenerate) {
		return null;
	}

	// Format Name
	const dateFormatter = new Intl.DateTimeFormat("en-US", {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
	const dateStr = dateFormatter.format(now);

	if (generationConfig.frequency === "daily") {
		listName = `Daily: ${dateStr}`;
	} else if (generationConfig.frequency === "weekly") {
		listName = `Weekly: ${dateStr}`;
	} else {
		listName = `Auto: ${dateStr}`;
	}

	// Generate the list
	console.log(`[Automation] Generating list '${listName}' for user ${userId}`);
	const result = await createGroceryListFromAllMeals(
		context.cloudflare.env.DB,
		userId,
		listName,
	);

	// Update lastGeneratedAt
	const newSettings: UserSettings = {
		...settings,
		listGeneration: {
			...generationConfig,
			lastGeneratedAt: now.toISOString(),
		},
	};

	await db
		.update(schema.user)
		.set({ settings: newSettings })
		.where(eq(schema.user.id, userId));

	return result.list;
}
