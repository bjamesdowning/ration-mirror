import { Link, redirect } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { buildWebFlagContext } from "~/lib/feature-flags/flags.server";
import { isNutritionFuelPageEnabled } from "~/lib/nutrition/fast-log-flag.server";
import { previousEqualCalendarRange } from "~/lib/nutrition/macros-range";
import { getMacrosHistory } from "~/lib/nutrition/service.server";
import type { Route } from "./+types/fuel.analytics";

export async function loader({ request, context }: Route.LoaderArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const env = context.cloudflare.env;
	const flags = buildWebFlagContext(request, env, { user });
	if (!(await isNutritionFuelPageEnabled(env, flags))) {
		throw redirect("/hub");
	}
	const url = new URL(request.url);
	const range = url.searchParams.get("range") ?? "week";
	const includeToday = url.searchParams.get("includeToday") !== "0";
	const today = new Date().toISOString().slice(0, 10);
	const to = includeToday ? today : shiftDate(today, -1);
	const from =
		range === "month"
			? shiftDate(to, -29)
			: range === "custom" && url.searchParams.get("from")
				? (url.searchParams.get("from") as string)
				: shiftDate(to, -6);
	const principal = {
		userId: user.id,
		organizationId: groupId,
		surface: "web" as const,
		authMethod: "session" as const,
		credentialId: null,
		clientId: null,
		scopes: ["nutrition:read", "nutrition:write"],
		requestId: crypto.randomUUID(),
	};
	try {
		const page = await getMacrosHistory(env, principal, flags, from, to);
		const previous = previousEqualCalendarRange(from, to);
		return {
			range,
			includeToday,
			from,
			to,
			previous,
			current: page.current,
			prior: page.previous,
		};
	} catch {
		return {
			range,
			includeToday,
			from,
			to,
			previous: null,
			current: null,
			prior: null,
		};
	}
}

function shiftDate(iso: string, days: number): string {
	const date = new Date(`${iso}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

export default function FuelAnalyticsPage({
	loaderData,
}: Route.ComponentProps) {
	const days = loaderData.current?.days ?? [];
	const totals = days.reduce(
		(sum, day) => {
			sum.energy += day.energyKcal;
			sum.count += 1;
			return sum;
		},
		{ energy: 0, count: 0 },
	);
	const average = totals.count ? Math.round(totals.energy / totals.count) : 0;
	const priorDays = loaderData.prior?.days ?? [];
	const priorAverage = priorDays.length
		? Math.round(
				priorDays.reduce((sum, day) => sum + day.energyKcal, 0) /
					priorDays.length,
			)
		: 0;
	return (
		<div className="space-y-6 max-w-3xl">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold">Macros</h1>
				<Link
					to="/hub/fuel"
					className="min-h-11 inline-flex items-center text-sm"
				>
					Back to Fuel
				</Link>
			</div>
			<nav className="flex gap-2 text-sm" aria-label="Range">
				{(["week", "month", "custom"] as const).map((range) => (
					<Link
						key={range}
						to={`/hub/fuel/analytics?range=${range}`}
						className="min-h-11 inline-flex items-center rounded-xl border border-platinum px-3 capitalize"
						aria-current={loaderData.range === range ? "page" : undefined}
					>
						{range}
					</Link>
				))}
				<Link
					to={`/hub/fuel/analytics?range=${loaderData.range}&includeToday=${loaderData.includeToday ? "0" : "1"}`}
					className="min-h-11 inline-flex items-center rounded-xl border border-platinum px-3"
				>
					{loaderData.includeToday ? "Include today" : "Today excluded"}
				</Link>
			</nav>
			<p className="text-sm">
				Average {average} kcal. Previous period {priorAverage} kcal.
			</p>
			<ul className="space-y-2">
				{days.map((day) => (
					<li key={day.date}>
						<Link
							to={`/hub/fuel?date=${day.date}`}
							className="min-h-11 flex items-center justify-between text-sm"
						>
							<span>{day.date}</span>
							<span>{Math.round(day.energyKcal)} kcal</span>
						</Link>
					</li>
				))}
			</ul>
			{days.length === 0 ? (
				<p className="text-sm text-muted">No day totals in this range.</p>
			) : null}
		</div>
	);
}
