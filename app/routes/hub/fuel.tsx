import { useEffect, useState } from "react";
import {
	Link,
	redirect,
	useFetcher,
	useNavigate,
	useRevalidator,
	useSearchParams,
} from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { buildWebFlagContext } from "~/lib/feature-flags/flags.server";
import { isNutritionFuelPageEnabled } from "~/lib/nutrition/fast-log-flag.server";
import { loadFuelDay } from "~/lib/nutrition/fuel-read.server";
import type { Route } from "./+types/fuel";

const APPLE_HEALTH_REMAINS =
	"Apple Health samples Ration already wrote stay in the Health app until you delete them there. A deletion started on another device cannot remove them.";

export async function loader({ request, context }: Route.LoaderArgs) {
	const {
		session: { user },
	} = await requireActiveGroup(context, request);
	const env = context.cloudflare.env;
	const flags = buildWebFlagContext(request, env, { user });
	if (!(await isNutritionFuelPageEnabled(env, flags))) {
		throw redirect("/hub");
	}
	const url = new URL(request.url);
	const requested = url.searchParams.get("date");
	const date =
		requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
			? requested
			: new Date().toISOString().slice(0, 10);
	const day = await loadFuelDay(env.DB, user.id, date);
	return { day, healthNote: APPLE_HEALTH_REMAINS };
}

export default function FuelPage({ loaderData }: Route.ComponentProps) {
	const { day } = loaderData;
	const [params] = useSearchParams();
	const editor = params.get("editor") === "goals";
	const navigate = useNavigate();
	const revalidator = useRevalidator();
	const [online, setOnline] = useState(true);
	const [pendingName, setPendingName] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [showAdd, setShowAdd] = useState(false);
	const [showGoals, setShowGoals] = useState(editor);
	const capped = day.limit != null && day.used >= day.limit;

	useEffect(() => {
		const sync = () => setOnline(navigator.onLine);
		sync();
		window.addEventListener("online", sync);
		window.addEventListener("offline", sync);
		return () => {
			window.removeEventListener("online", sync);
			window.removeEventListener("offline", sync);
		};
	}, []);

	useEffect(() => {
		setShowGoals(editor);
	}, [editor]);

	function openCreate(kind: "add" | "scan" | "barcode") {
		if (!online) return;
		if (capped) {
			navigate("/hub/pricing");
			return;
		}
		if (kind === "add") setShowAdd(true);
		if (kind === "scan")
			setError("Choose a photo. The scan queue confirms one meal.");
		if (kind === "barcode")
			setError("Enter a barcode of 8, 12, 13, or 14 digits.");
	}

	async function submitAdd(form: FormData) {
		const name = String(form.get("name") ?? "").trim();
		const energy = Number(form.get("energyKcal") ?? "0");
		if (!name || !Number.isFinite(energy)) return;
		setPendingName(name);
		setError(null);
		const operationKey = crypto.randomUUID();
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 15000);
		try {
			const response = await fetch("/api/nutrition/diary", {
				method: "POST",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				signal: controller.signal,
				body: JSON.stringify({
					name,
					occurredAt: new Date().toISOString(),
					amount: 1,
					unit: "serving",
					macros: {
						energyKcal: energy,
						proteinG: Number(form.get("proteinG") ?? "0"),
						carbsG: Number(form.get("carbsG") ?? "0"),
						fatG: Number(form.get("fatG") ?? "0"),
					},
					idempotencyKey: operationKey,
					operationKey,
					compositionSource: "manual_macros",
				}),
			});
			if (!response.ok) {
				setPendingName(null);
				const body = (await response.json().catch(() => null)) as {
					code?: string;
				} | null;
				if (body?.code === "fuel_daily_limit") navigate("/hub/pricing");
				else if (body?.code === "fuel_timezone_required") {
					setError("Set a time zone before logging.");
				} else setError("That log was not saved.");
				return;
			}
			setPendingName(null);
			setShowAdd(false);
			revalidator.revalidate();
		} catch {
			setPendingName(null);
			setError("That log was not saved.");
		} finally {
			clearTimeout(timer);
		}
	}

	const counter =
		day.limit == null
			? `${day.items.length + (pendingName ? 1 : 0)} logs`
			: `${day.used} of ${day.limit} meals logged`;

	return (
		<div className="space-y-6 max-w-3xl">
			<div className="flex items-center justify-between gap-3">
				<h1 className="text-2xl font-semibold text-carbon">Fuel</h1>
				<Link
					to="/hub/fuel/analytics"
					className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-platinum px-3 text-sm font-medium"
					aria-label="Macros"
				>
					Macros
				</Link>
			</div>

			<div className="flex gap-2 overflow-x-auto">
				{day.week.map((date) => (
					<Link
						key={date}
						to={`/hub/fuel?date=${date}`}
						className={`min-h-11 min-w-11 rounded-xl px-2 text-center text-xs ${
							date === day.date ? "bg-hyper-green/15 text-carbon" : "text-muted"
						}`}
					>
						<span className="block">{date.slice(8)}</span>
						{day.loggedDates.includes(date) ? (
							<span className="block">Logged</span>
						) : null}
					</Link>
				))}
			</div>

			<label className="block text-sm">
				<span className="text-muted">
					{day.week[0]} – {day.week[day.week.length - 1]}
				</span>
				<input
					type="date"
					className="mt-1 block min-h-11"
					defaultValue={day.date}
					aria-label="Jump calendar"
					onChange={(event) => {
						if (event.target.value) {
							navigate(`/hub/fuel?date=${event.target.value}`);
						}
					}}
				/>
			</label>

			<p className="text-sm text-carbon" aria-live="polite">
				{counter}
			</p>
			{day.totals ? (
				<p className="text-sm text-muted">
					{Math.round(day.totals.energyKcal)} kcal ·{" "}
					{Math.round(day.totals.proteinG)} g protein ·{" "}
					{Math.round(day.totals.carbsG)} g carbs ·{" "}
					{Math.round(day.totals.fatG)} g fat
				</p>
			) : (
				<p className="text-sm text-muted">No logs for this day.</p>
			)}
			{day.goal ? null : (
				<button
					type="button"
					className="min-h-11 text-sm underline"
					onClick={() => setShowGoals(true)}
				>
					No goals · Set targets
				</button>
			)}

			{online ? null : (
				<p className="text-sm text-carbon">
					You're offline. Fuel writes, scans, and barcodes stay off until the
					connection returns.
				</p>
			)}
			{error ? <p className="text-sm text-carbon">{error}</p> : null}

			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					className="min-h-11 min-w-11 rounded-xl bg-hyper-green px-4 text-sm font-semibold text-carbon disabled:opacity-50"
					aria-label="Add Fuel"
					disabled={!online}
					onClick={() => openCreate("add")}
				>
					+ Add Fuel
				</button>
				<button
					type="button"
					className="min-h-11 min-w-11 rounded-xl border border-platinum px-4 text-sm disabled:opacity-50"
					aria-label="Scan to Fuel"
					disabled={!online}
					onClick={() => openCreate("scan")}
				>
					Scan to Fuel
				</button>
				<button
					type="button"
					className="min-h-11 min-w-11 rounded-xl border border-platinum px-4 text-sm disabled:opacity-50"
					aria-label="Barcode to Fuel"
					disabled={!online}
					onClick={() => openCreate("barcode")}
				>
					Barcode to Fuel
				</button>
			</div>

			<section aria-label={day.diaryLayout === "slots" ? "Slots" : "Timeline"}>
				<h2 className="text-xs uppercase tracking-widest text-muted mb-2">
					{day.diaryLayout === "slots" ? "Slots" : "Timeline"}
				</h2>
				<ul className="space-y-2">
					{pendingName ? (
						<li className="text-sm text-muted">Saving {pendingName}</li>
					) : null}
					{day.items.map((item) => (
						<li
							key={item.id}
							className="flex items-center justify-between gap-3 rounded-xl border border-platinum px-3 py-2"
						>
							<span className="text-sm">{item.mealName ?? "Food"}</span>
							<span className="text-xs text-muted">
								{Math.round(item.energyKcal)} kcal
							</span>
						</li>
					))}
					{day.items.length === 0 && !pendingName ? (
						<li className="text-sm text-muted">Nothing logged on this day.</li>
					) : null}
				</ul>
			</section>

			{showAdd ? (
				<form
					className="space-y-3 rounded-xl border border-platinum p-4"
					onSubmit={(event) => {
						event.preventDefault();
						void submitAdd(new FormData(event.currentTarget));
					}}
				>
					<label className="block text-sm">
						Name
						<input
							name="name"
							required
							className="mt-1 block min-h-11 w-full"
						/>
					</label>
					<label className="block text-sm">
						Daily calories
						<input
							name="energyKcal"
							type="number"
							min="0"
							max="20000"
							required
							className="mt-1 block min-h-11 w-full"
						/>
					</label>
					<label className="block text-sm">
						Protein
						<input
							name="proteinG"
							type="number"
							min="0"
							max="2000"
							defaultValue="0"
							className="mt-1 block min-h-11 w-full"
						/>
					</label>
					<label className="block text-sm">
						Carbs
						<input
							name="carbsG"
							type="number"
							min="0"
							max="2000"
							defaultValue="0"
							className="mt-1 block min-h-11 w-full"
						/>
					</label>
					<label className="block text-sm">
						Fat
						<input
							name="fatG"
							type="number"
							min="0"
							max="2000"
							defaultValue="0"
							className="mt-1 block min-h-11 w-full"
						/>
					</label>
					<button
						type="submit"
						className="min-h-11 rounded-xl bg-carbon px-4 text-ceramic"
					>
						Save
					</button>
				</form>
			) : null}

			{showGoals ? <GoalEditor date={day.date} /> : null}
			<p className="text-xs text-muted">{loaderData.healthNote}</p>
		</div>
	);
}

function GoalEditor({ date }: { date: string }) {
	const fetcher = useFetcher();
	return (
		<fetcher.Form
			method="post"
			action="/api/nutrition/goals"
			className="space-y-3 rounded-xl border border-platinum p-4"
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				const body: Record<string, unknown> = {
					operationKey: crypto.randomUUID(),
					effectiveFrom: date,
				};
				for (const key of [
					"dailyEnergyKcal",
					"proteinG",
					"carbsG",
					"fatG",
					"fiberG",
				]) {
					const raw = String(form.get(key) ?? "").trim();
					if (raw) body[key] = Number(raw);
				}
				fetcher.submit(JSON.stringify(body), {
					method: "post",
					action: "/api/nutrition/goals",
					encType: "application/json",
				});
			}}
		>
			<h2 className="text-sm font-semibold">Goals</h2>
			{(
				[
					["dailyEnergyKcal", "Daily calories", 20000],
					["proteinG", "Protein", 2000],
					["carbsG", "Carbs", 2000],
					["fatG", "Fat", 2000],
					["fiberG", "Fiber", 500],
				] as const
			).map(([name, label, max]) => (
				<label key={name} className="block text-sm">
					{label}
					<input
						name={name}
						type="number"
						min="0"
						max={max}
						className="mt-1 block min-h-11 w-full"
					/>
				</label>
			))}
			<button
				type="submit"
				className="min-h-11 rounded-xl bg-carbon px-4 text-ceramic"
			>
				Save
			</button>
		</fetcher.Form>
	);
}
