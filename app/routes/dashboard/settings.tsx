// @ts-nocheck
import { getAuth } from "@clerk/react-router/ssr.server";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Form, redirect, useNavigation } from "react-router";
import { DashboardHeader } from "../../components/dashboard/DashboardHeader";
import * as schema from "../../db/schema";
import type { Route } from "./+types/settings";

export async function loader(args: Route.LoaderArgs) {
	const { userId } = await getAuth(args);
	if (!userId) throw redirect("/sign-in");

	const env = args.context.env as Env;
	const db = drizzle(env.DB, { schema });

	const user = await db.query.users.findFirst({
		where: (users, { eq }) => eq(users.id, userId),
	});

	if (!user) throw redirect("/sign-in");

	const settings = JSON.parse(user.settings as string);

	return {
		settings,
	};
}

export async function action(args: Route.ActionArgs) {
	const { userId } = await getAuth(args);
	if (!userId) throw redirect("/sign-in");

	const formData = await args.request.formData();
	const intent = formData.get("intent");

	const env = args.context.env as Env;
	const db = drizzle(env.DB, { schema });

	if (intent === "update-units") {
		const unitSystem = formData.get("unitSystem"); // "metric" | "imperial"

		const user = await db.query.users.findFirst({
			where: (users, { eq }) => eq(users.id, userId),
		});

		if (user) {
			const currentSettings = JSON.parse(user.settings as string);
			const newSettings = { ...currentSettings, unitSystem };

			await db
				.update(schema.users)
				.set({ settings: JSON.stringify(newSettings) })
				.where(eq(schema.users.id, userId));
		}

		return { success: true };
	}

	return null;
}

export default function Settings({ loaderData }: Route.ComponentProps) {
	const { settings } = loaderData;
	const navigation = useNavigation();
	const isUpdating =
		navigation.state === "submitting" &&
		navigation.formData?.get("intent") === "update-units";
	const isPurging =
		navigation.state === "submitting" &&
		navigation.formAction === "/api/user/purge";

	return (
		<div className="space-y-8 pb-20">
			<DashboardHeader title="CONFIGURATION" subtitle="SYSTEM PREFERENCES" />

			<div className="space-y-8">
				{/* Unit System */}
				<section className="bg-[#0A1A0A] border border-[#39FF14]/30 p-6 relative">
					<h2 className="text-xl font-bold mb-4 text-[#39FF14]">
						MEASUREMENT STANDARD
					</h2>
					<Form method="post" className="flex gap-4">
						<input type="hidden" name="intent" value="update-units" />

						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="unitSystem"
								value="metric"
								defaultChecked={settings.unitSystem !== "imperial"}
								className="accent-[#39FF14] bg-transparent border-[#39FF14]"
								onChange={(e) => e.target.form?.requestSubmit()}
							/>
							<span className="text-white">METRIC (g, kg, ml)</span>
						</label>

						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="unitSystem"
								value="imperial"
								defaultChecked={settings.unitSystem === "imperial"}
								className="accent-[#39FF14] bg-transparent border-[#39FF14]"
								onChange={(e) => e.target.form?.requestSubmit()}
							/>
							<span className="text-white">IMPERIAL (oz, lb, fl oz)</span>
						</label>

						{isUpdating && (
							<span className="text-[#39FF14] animate-pulse text-xs ml-4 my-auto">
								SAVING...
							</span>
						)}
					</Form>
				</section>

				{/* Danger Zone */}
				<section className="bg-[#1A0505] border border-red-500/50 p-6 relative">
					<div className="absolute top-0 right-0 bg-red-500/20 px-2 py-1 text-[10px] text-red-500 border-l border-b border-red-500/50">
						DANGER ZONE
					</div>

					<h2 className="text-xl font-bold mb-2 text-red-500">
						IDENTITY PURGE
					</h2>
					<p className="text-sm text-red-400/80 mb-6 max-w-md">
						Complete removal of biological signature from database. This action
						deletes all inventory, ledger history, and user records.
						IRREVERSIBLE.
					</p>

					<Form
						action="/api/user/purge"
						method="post"
						onSubmit={(e) => {
							if (
								!confirm(
									"WARNING: CONFIRM IDENTITY PURGE? THIS CANNOT BE UNDONE.",
								)
							) {
								e.preventDefault();
							}
						}}
					>
						<button
							type="submit"
							disabled={isPurging}
							className="px-4 py-2 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors uppercase tracking-widest text-sm disabled:opacity-50"
						>
							{isPurging ? "PURGING..." : "INITIATE PURGE SEQUENCE"}
						</button>
					</Form>
				</section>
			</div>
		</div>
	);
}
