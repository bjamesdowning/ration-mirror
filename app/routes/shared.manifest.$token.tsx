import { data, Link } from "react-router";
import { CalendarIcon } from "~/components/icons/PageIcons";
import {
	getMealPlanByShareToken,
	getTodayISO,
	getWeekDates,
	getWeekStart,
} from "~/lib/manifest.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { SlotType } from "~/lib/schemas/manifest";
import { SLOT_LABELS, SLOT_TYPES } from "~/lib/schemas/manifest";
import type { Route } from "./+types/shared.manifest.$token";

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
	if (!loaderData?.plan) {
		return [{ title: "Manifest Not Found - Ration" }];
	}
	return [
		{ title: `${loaderData.plan.name} - Shared Manifest - Ration` },
		{
			name: "description",
			content: `Shared meal plan: ${loaderData.plan.name}`,
		},
	];
};

export async function loader({ context, params, request }: Route.LoaderArgs) {
	const clientIp =
		request.headers.get("CF-Connecting-IP") ||
		request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
		"unknown";

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"shared_public",
		clientIp,
	);

	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests" },
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() ?? "60",
				},
			},
		);
	}

	const token = params.token;
	if (!token) throw data({ error: "Invalid share link" }, { status: 400 });

	const plan = await getMealPlanByShareToken(context.cloudflare.env.DB, token);
	if (!plan)
		throw data(
			{ error: "Manifest not found or link expired" },
			{ status: 404 },
		);

	const today = getTodayISO();
	// Show current week and next week (2 weeks)
	const weekStart1 = getWeekStart(today, "sunday");
	const weekStart2 = (() => {
		const d = new Date(`${weekStart1}T00:00:00`);
		d.setDate(d.getDate() + 7);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${y}-${m}-${day}`;
	})();

	const week1Dates = getWeekDates(weekStart1);
	const week2Dates = getWeekDates(weekStart2);

	return { plan, today, week1Dates, week2Dates };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function WeekGrid({
	dates,
	entries,
	today,
}: {
	dates: string[];
	entries: Array<{ date: string; slotType: string; mealName: string }>;
	today: string;
}) {
	return (
		<div className="grid grid-cols-7 gap-2">
			{dates.map((date) => {
				const d = new Date(`${date}T00:00:00`);
				const dayName = DAY_NAMES[d.getDay()];
				const dayNum = d.getDate();
				const isToday = date === today;
				const isPast = date < today;

				const dayEntries = entries.filter((e) => e.date === date);

				return (
					<div
						key={date}
						className={`flex flex-col gap-1.5 ${isPast ? "opacity-50" : ""}`}
					>
						<div
							className={`text-center py-2 rounded-xl ${
								isToday
									? "bg-hyper-green text-carbon"
									: "bg-platinum/50 text-muted"
							}`}
						>
							<p className="text-[10px] font-semibold uppercase tracking-wide">
								{dayName}
							</p>
							<p className="text-sm font-bold">{dayNum}</p>
						</div>
						<div
							className={`rounded-xl border p-2 space-y-1 min-h-[60px] ${
								isToday
									? "border-hyper-green/20 bg-hyper-green/5"
									: "border-platinum bg-white/20"
							}`}
						>
							{SLOT_TYPES.map((slot) => {
								const slotEntries = dayEntries.filter(
									(e) => e.slotType === slot,
								);
								if (slotEntries.length === 0) return null;
								return (
									<div key={slot} className="space-y-0.5">
										<p className="text-[10px] font-semibold text-muted uppercase tracking-wide">
											{SLOT_LABELS[slot]}
										</p>
										{slotEntries.map((e, i) => (
											<p
												key={`${e.date}-${slot}-${i}`}
												className="text-[11px] text-carbon truncate font-medium"
											>
												{e.mealName}
											</p>
										))}
									</div>
								);
							})}
							{dayEntries.length === 0 && (
								<p className="text-center text-muted text-xs mt-2">—</p>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function DayList({
	dates,
	entries,
	today,
}: {
	dates: string[];
	entries: Array<{ date: string; slotType: string; mealName: string }>;
	today: string;
}) {
	const MONTH_NAMES = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	const FULL_DAY_NAMES = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	];

	return (
		<div className="space-y-4">
			{dates.map((date) => {
				const d = new Date(`${date}T00:00:00`);
				const isToday = date === today;
				const isPast = date < today;
				const dayEntries = entries.filter((e) => e.date === date);

				return (
					<div
						key={date}
						className={`rounded-2xl border p-4 ${
							isToday
								? "border-hyper-green/30 bg-hyper-green/5"
								: isPast
									? "border-platinum/50 opacity-60"
									: "border-platinum bg-white/30"
						}`}
					>
						<p className="text-sm font-bold text-carbon mb-3">
							{FULL_DAY_NAMES[d.getDay()]}, {MONTH_NAMES[d.getMonth()]}{" "}
							{d.getDate()}
							{isToday && (
								<span className="ml-2 text-xs font-medium text-hyper-green bg-hyper-green/10 px-2 py-0.5 rounded-full">
									Today
								</span>
							)}
						</p>
						{dayEntries.length === 0 ? (
							<p className="text-xs text-muted italic">Nothing planned</p>
						) : (
							<div className="space-y-2">
								{([...SLOT_TYPES] as SlotType[]).map((slot) => {
									const slotEntries = dayEntries.filter(
										(e) => e.slotType === slot,
									);
									if (slotEntries.length === 0) return null;
									return (
										<div key={slot} className="flex gap-3">
											<span className="text-[10px] font-semibold text-muted uppercase tracking-wide w-14 pt-0.5 font-mono shrink-0">
												{SLOT_LABELS[slot]}
											</span>
											<div className="space-y-0.5 flex-1">
												{slotEntries.map((e, i) => (
													<p
														key={`${e.date}-${slot}-${i}`}
														className="text-sm text-carbon font-medium"
													>
														{e.mealName}
													</p>
												))}
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

function formatWeekLabel(weekDates: string[]): string {
	const start = weekDates[0];
	const end = weekDates[weekDates.length - 1];
	const s = new Date(`${start}T00:00:00`);
	const e = new Date(`${end}T00:00:00`);
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	if (s.getMonth() === e.getMonth()) {
		return `${months[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
	}
	return `${months[s.getMonth()]} ${s.getDate()} – ${months[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
}

export default function SharedManifestPage({
	loaderData,
}: Route.ComponentProps) {
	const { plan, today, week1Dates, week2Dates } = loaderData;

	return (
		<div className="min-h-screen bg-ceramic py-8 px-4">
			<div className="max-w-4xl mx-auto">
				{/* Header */}
				<div className="flex items-center gap-3 mb-6">
					<Link
						to="/"
						className="flex items-center gap-2 text-hyper-green hover:opacity-80 transition-opacity"
					>
						<img
							src="/static/ration-logo.svg"
							alt="Ration"
							className="w-8 h-8"
						/>
					</Link>
					<div className="w-px h-6 bg-platinum" />
					<div className="flex items-center gap-2">
						<CalendarIcon className="w-5 h-5 text-hyper-green" />
						<h1 className="text-lg font-bold text-carbon">{plan.name}</h1>
					</div>
					<span className="ml-auto text-xs text-muted bg-platinum px-2 py-1 rounded-lg">
						Read-only
					</span>
				</div>

				{/* Week 1 */}
				<section className="mb-8">
					<h2 className="text-sm font-semibold text-muted mb-3 font-mono uppercase tracking-wide">
						{formatWeekLabel(week1Dates)}
					</h2>
					{/* Desktop grid */}
					<div className="hidden md:block">
						<WeekGrid dates={week1Dates} entries={plan.entries} today={today} />
					</div>
					{/* Mobile list */}
					<div className="md:hidden">
						<DayList dates={week1Dates} entries={plan.entries} today={today} />
					</div>
				</section>

				{/* Week 2 */}
				<section className="mb-8">
					<h2 className="text-sm font-semibold text-muted mb-3 font-mono uppercase tracking-wide">
						{formatWeekLabel(week2Dates)}
					</h2>
					<div className="hidden md:block">
						<WeekGrid dates={week2Dates} entries={plan.entries} today={today} />
					</div>
					<div className="md:hidden">
						<DayList dates={week2Dates} entries={plan.entries} today={today} />
					</div>
				</section>

				{/* Footer CTA */}
				<div className="text-center pt-6 border-t border-platinum">
					<p className="text-sm text-muted mb-3">
						Plan your own meals with Ration
					</p>
					<Link
						to="/"
						className="inline-flex items-center gap-2 px-5 py-2.5 bg-hyper-green text-carbon font-semibold rounded-xl shadow-glow-sm hover:shadow-glow transition-all text-sm"
					>
						Get Ration
					</Link>
				</div>
			</div>
		</div>
	);
}
