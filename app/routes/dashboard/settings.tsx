import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { Form, redirect, useNavigation } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { DashboardHeader } from "../../components/dashboard/DashboardHeader";
import * as schema from "../../db/schema";
import type { Route } from "./+types/settings";

interface Settings {
	unitSystem?: "metric" | "imperial";
	expirationAlertDays?: number;
}

export async function loader(args: Route.LoaderArgs) {
	const { user: authUser } = await requireAuth(args.context, args.request);
	const userId = authUser.id;

	const env = args.context.cloudflare.env;
	const db = drizzle(env.DB, { schema });

	const user = await db.query.user.findFirst({
		where: (user, { eq }) => eq(user.id, userId),
	});

	if (!user) throw redirect("/sign-in");

	// Drizzle automatically parses JSON mode fields
	const settings = (user.settings as Settings) || {};

	return {
		settings,
	};
}

export async function action(args: Route.ActionArgs) {
	const { user: authUser } = await requireAuth(args.context, args.request);
	const userId = authUser.id;

	const formData = await args.request.formData();
	const intent = formData.get("intent");

	const env = args.context.cloudflare.env;
	const db = drizzle(env.DB, { schema });

	if (intent === "update-units") {
		const unitSystem = formData.get("unitSystem"); // "metric" | "imperial"

		const user = await db.query.user.findFirst({
			where: (user, { eq }) => eq(user.id, userId),
		});

		if (user) {
			// Drizzle automatically parses/stringifies JSON mode fields
			const currentSettings = (user.settings as Settings) || {};
			const newSettings: Settings = {
				...currentSettings,
				unitSystem: unitSystem as "metric" | "imperial",
			};

			await db
				.update(schema.user)
				.set({ settings: newSettings })
				.where(eq(schema.user.id, userId));
		}

		return { success: true };
	}

	if (intent === "update-expiration-alert") {
		const days = Number(formData.get("expirationAlertDays")) || 7;
		const clampedDays = Math.min(Math.max(days, 1), 30); // Clamp between 1-30

		const user = await db.query.user.findFirst({
			where: (user, { eq }) => eq(user.id, userId),
		});

		if (user) {
			const currentSettings = (user.settings as Settings) || {};
			const newSettings: Settings = {
				...currentSettings,
				expirationAlertDays: clampedDays,
			};

			await db
				.update(schema.user)
				.set({ settings: newSettings })
				.where(eq(schema.user.id, userId));
		}

		return { success: true };
	}

	return null;
}

export default function Settings({ loaderData }: Route.ComponentProps) {
	const { settings } = loaderData;
	const navigation = useNavigation();
	const isUpdatingUnits =
		navigation.state === "submitting" &&
		navigation.formData?.get("intent") === "update-units";
	const isUpdatingExpiration =
		navigation.state === "submitting" &&
		navigation.formData?.get("intent") === "update-expiration-alert";
	const isPurging =
		navigation.state === "submitting" &&
		navigation.formAction === "/api/user/purge";

	return (
		<div className="space-y-8 pb-20">
			<DashboardHeader title="Configuration" subtitle="System Preferences" />

			<div className="space-y-8">
				{/* Unit System */}
				<section className="glass-panel rounded-xl p-6">
					<h2 className="text-xl font-bold mb-4 text-carbon">
						Measurement Standard
					</h2>
					<Form method="post" className="flex gap-4 flex-wrap">
						<input type="hidden" name="intent" value="update-units" />

						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="unitSystem"
								value="metric"
								defaultChecked={settings.unitSystem !== "imperial"}
								className="w-4 h-4 accent-hyper-green"
								onChange={(e) => e.target.form?.requestSubmit()}
							/>
							<span className="text-carbon">Metric (g, kg, ml)</span>
						</label>

						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="unitSystem"
								value="imperial"
								defaultChecked={settings.unitSystem === "imperial"}
								className="w-4 h-4 accent-hyper-green"
								onChange={(e) => e.target.form?.requestSubmit()}
							/>
							<span className="text-carbon">Imperial (oz, lb, fl oz)</span>
						</label>

						{isUpdatingUnits && (
							<span className="text-hyper-green animate-pulse text-sm ml-4 my-auto">
								Saving...
							</span>
						)}
					</Form>
				</section>

				{/* Expiration Alert */}
				<section className="glass-panel rounded-xl p-6">
					<h2 className="text-xl font-bold mb-2 text-carbon">
						Expiration Alerts
					</h2>
					<p className="text-sm text-muted mb-4">
						Get alerts for items expiring within this many days
					</p>
					<Form method="post" className="flex items-center gap-4">
						<input
							type="hidden"
							name="intent"
							value="update-expiration-alert"
						/>
						<input
							type="range"
							name="expirationAlertDays"
							min="1"
							max="30"
							defaultValue={settings.expirationAlertDays || 7}
							onChange={(e) => {
								const display = e.target.nextElementSibling;
								if (display) display.textContent = `${e.target.value} days`;
							}}
							onMouseUp={(e) => e.currentTarget.form?.requestSubmit()}
							onTouchEnd={(e) => e.currentTarget.form?.requestSubmit()}
							className="flex-1 h-2 bg-platinum rounded-lg appearance-none cursor-pointer accent-hyper-green"
						/>
						<span className="text-carbon font-bold min-w-[60px] text-right">
							{settings.expirationAlertDays || 7} days
						</span>
						{isUpdatingExpiration && (
							<span className="text-hyper-green animate-pulse text-sm">
								Saving...
							</span>
						)}
					</Form>
				</section>

				{/* Danger Zone */}
				<section className="bg-danger/5 border border-danger/20 rounded-xl p-6 relative">
					<div className="absolute top-4 right-4 bg-danger/20 px-2 py-1 text-xs text-danger rounded-md font-semibold">
						Danger Zone
					</div>

					<h2 className="text-xl font-bold mb-2 text-danger">Delete Account</h2>
					<p className="text-sm text-muted mb-6 max-w-md">
						Complete removal of your account and data. This action deletes all
						inventory, ledger history, and user records. This cannot be undone.
					</p>

					<Form
						action="/api/user/purge"
						method="post"
						onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
							if (
								!confirm(
									"Are you sure you want to delete your account? This cannot be undone.",
								)
							) {
								e.preventDefault();
							}
						}}
					>
						<button
							type="submit"
							disabled={isPurging}
							className="px-4 py-2 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 transition-colors disabled:opacity-50"
						>
							{isPurging ? "Deleting..." : "Delete Account"}
						</button>
					</Form>
				</section>
			</div>
		</div>
	);
}
