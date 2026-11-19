import { useEffect, useRef, useState } from "react";
import {
	data,
	Link,
	redirect,
	useFetcher,
	useNavigate,
	useRevalidator,
	useRouteLoaderData,
	useSearchParams,
} from "react-router";
import { useOpenHubAction } from "~/components/hub/useHubAction";
import { patchUserSettings, requireActiveGroup } from "~/lib/auth.server";
import { buildWebFlagContext } from "~/lib/feature-flags/flags.server";
import { AI_COSTS, checkBalance } from "~/lib/ledger.server";
import {
	cargoAddFuelMacros,
	manualFuelEntry,
	matchesTagDisplayNames,
	mealAddFuelMacros,
} from "~/lib/nutrition/add-fuel";
import {
	isNutritionFastLogEnabled,
	isNutritionFuelPageEnabled,
} from "~/lib/nutrition/fast-log-flag.server";
import {
	type FuelPhotoReviewDraft,
	fuelPhotoApproveBody,
	fuelPhotoPixelSize,
	fuelPhotoReviewFromLines,
	pollFuelPhoto,
} from "~/lib/nutrition/fuel-photo-client";
import {
	FUEL_SCAN_NEXT_STEPS,
	FUEL_SCAN_NOT_MEDICAL,
	FUEL_SCAN_UNAVAILABLE,
} from "~/lib/nutrition/fuel-scan-copy";
import { loadFuelDay } from "~/lib/nutrition/fuel-read.server";
import type { NutritionSnapshot } from "~/lib/nutrition/types";
import {
	deviceFuelTimeZone,
	FUEL_ZONE_UNUSABLE,
	retryFuelZoneOnce,
	withDeviceFuelZone,
} from "~/lib/nutrition/fuel-zone-client";
import { FUEL_PHOTO_MAX_BYTES } from "~/lib/schemas/fuel";
import type { Route } from "./+types/fuel";

const APPLE_HEALTH_REMAINS =
	"Apple Health samples Ration already wrote stay in the Health app until you delete them there. A deletion started on another device cannot remove them.";

export async function loader({ request, context }: Route.LoaderArgs) {
	const {
		session: { user },
		groupId,
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
	const [day, credits] = await Promise.all([
		loadFuelDay(env.DB, user.id, date),
		checkBalance(env, groupId),
	]);
	return { day, healthNote: APPLE_HEALTH_REMAINS, credits };
}

export async function action({ request, context }: Route.ActionArgs) {
	const {
		session: { user },
	} = await requireActiveGroup(context, request);
	const env = context.cloudflare.env;
	const flags = buildWebFlagContext(request, env, { user });
	if (!(await isNutritionFuelPageEnabled(env, flags))) {
		throw data({ code: "FEATURE_DISABLED" }, { status: 403 });
	}
	const form = await request.formData();
	if (form.get("intent") !== "update-diary-layout") {
		throw data({ code: "invalid_request" }, { status: 400 });
	}
	const layout = form.get("diaryLayout");
	if (layout !== "timeline" && layout !== "slots") {
		throw data({ code: "invalid_request" }, { status: 400 });
	}
	if (!(await isNutritionFastLogEnabled(env, flags))) {
		throw data({ code: "FEATURE_DISABLED" }, { status: 403 });
	}
	await patchUserSettings(env.DB, user.id, { diaryLayout: layout });
	return { diaryLayout: layout };
}

export default function FuelPage({ loaderData }: Route.ComponentProps) {
	const { day, credits } = loaderData;
	const [params] = useSearchParams();
	const editor = params.get("editor") === "goals";
	const navigate = useNavigate();
	const revalidator = useRevalidator();
	const [online, setOnline] = useState(true);
	const [pendingName, setPendingName] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [showAdd, setShowAdd] = useState(false);
	const [showGoals, setShowGoals] = useState(editor);
	const [showBarcode, setShowBarcode] = useState(false);
	const rootData = useRouteLoaderData("root") as
		| { clientFlags?: { nutritionPhotoLog?: boolean } }
		| undefined;
	const photoLog = rootData?.clientFlags?.nutritionPhotoLog === true;
	const [showScan, setShowScan] = useState(false);
	const capped = day.limit != null && day.used >= day.limit;
	const pollAbort = useRef<AbortController | null>(null);

	useEffect(() => {
		return () => {
			pollAbort.current?.abort();
		};
	}, []);

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

	useOpenHubAction("log-to-fuel", true, () => {
		setShowAdd(false);
		if (day.limit != null && day.used >= day.limit) {
			navigate("/hub/pricing");
			return;
		}
		setShowScan(true);
	});

	function openCreate(kind: "add" | "scan" | "barcode") {
		if (!online) return;
		if (capped) {
			navigate("/hub/pricing");
			return;
		}
		setError(null);
		if (kind === "add") setShowAdd(true);
		if (kind === "scan") setShowScan(true);
		if (kind === "barcode") setShowBarcode(true);
	}

	async function voidRow(id: string) {
		if (!online) return;
		const response = await fetch(`/api/nutrition/diary/${id}`, {
			method: "DELETE",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				confirm: true,
				operationKey: crypto.randomUUID(),
			}),
		});
		if (!response.ok) {
			setError("That log was not removed.");
			return;
		}
		setError(null);
		revalidator.revalidate();
	}

	async function submitAdd(entry: {
		name: string;
		amount: number;
		unit: string;
		macros: {
			energyKcal: number;
			proteinG: number;
			carbsG: number;
			fatG: number;
		};
		compositionSource: "manual_macros" | "meal";
		tagNames: { name: string; slug?: string }[];
	}) {
		if (!online) {
			setError(
				"You're offline. Fuel writes, scans, and barcodes stay off until the connection returns.",
			);
			return;
		}
		setPendingName(entry.name);
		if (!deviceFuelTimeZone()) {
			setError(FUEL_ZONE_UNUSABLE);
			return;
		}
		setError(null);
		const operationKey = crypto.randomUUID();
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 15000);
		try {
			const payload = {
				name: entry.name,
				occurredAt: new Date().toISOString(),
				amount: entry.amount,
				unit: entry.unit,
				macros: entry.macros,
				idempotencyKey: operationKey,
				operationKey,
				compositionSource: entry.compositionSource,
				...(entry.tagNames.length > 0 ? { tagNames: entry.tagNames } : {}),
			};
			const send = () =>
				fetch("/api/nutrition/diary", {
					method: "POST",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json" },
					signal: controller.signal,
					body: JSON.stringify(withDeviceFuelZone(payload)),
				});
			const response = await retryFuelZoneOnce(await send(), send);
			if (!response.ok) {
				setPendingName(null);
				const body = (await response.json().catch(() => null)) as {
					code?: string;
				} | null;
				if (body?.code === "fuel_daily_limit") navigate("/hub/pricing");
				else if (body?.code === "fuel_timezone_required") {
					setError(FUEL_ZONE_UNUSABLE);
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

			<form method="post" className="flex gap-2">
				<input type="hidden" name="intent" value="update-diary-layout" />
				{(["timeline", "slots"] as const).map((layout) => (
					<button
						key={layout}
						type="submit"
						name="diaryLayout"
						value={layout}
						aria-pressed={day.diaryLayout === layout}
						className="min-h-11 rounded-xl border border-platinum px-3 text-sm capitalize"
					>
						{layout}
					</button>
				))}
			</form>

			{showScan && !capped ? (
				<ScanToFuel
					online={online}
					photoLog={photoLog}
					credits={credits}
					onClose={() => setShowScan(false)}
					onLimit={() => navigate("/hub/pricing")}
					onSaved={() => {
						setShowScan(false);
						revalidator.revalidate();
					}}
					onError={setError}
					pollAbort={pollAbort}
				/>
			) : null}
			{showBarcode && !capped ? (
				<BarcodeToFuel
					online={online}
					onClose={() => setShowBarcode(false)}
					onLimit={() => navigate("/hub/pricing")}
					onSaved={() => {
						setShowBarcode(false);
						revalidator.revalidate();
					}}
					onError={setError}
				/>
			) : null}

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
							<button
								type="button"
								className="min-h-11 px-3 text-sm"
								aria-label={`Void ${item.mealName ?? "food"}`}
								onClick={() => void voidRow(item.id)}
							>
								Void
							</button>
						</li>
					))}
					{day.items.length === 0 && !pendingName ? (
						<li className="text-sm text-muted">Nothing logged on this day.</li>
					) : null}
				</ul>
			</section>

			{showAdd ? (
				<AddFuelPanel
					onSave={(entry) => {
						void submitAdd(entry);
					}}
				/>
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
			<div className="flex gap-2">
				<button
					type="submit"
					className="min-h-11 rounded-xl bg-carbon px-4 text-ceramic"
				>
					Save
				</button>
				<button
					type="button"
					className="min-h-11 rounded-xl border border-platinum px-4 text-sm"
					onClick={() => {
						fetcher.submit(null, {
							method: "DELETE",
							action: `/api/nutrition/goals?operationKey=${crypto.randomUUID()}&asOf=${date}`,
						});
					}}
				>
					Clear
				</button>
			</div>
		</fetcher.Form>
	);
}

function ScanToFuel({
	online,
	photoLog,
	credits,
	onClose,
	onLimit,
	onSaved,
	onError,
	pollAbort,
}: {
	online: boolean;
	photoLog: boolean;
	credits: number;
	onClose: () => void;
	onLimit: () => void;
	onSaved: () => void;
	onError: (message: string) => void;
	pollAbort: { current: AbortController | null };
}) {
	const [review, setReview] = useState<
		(FuelPhotoReviewDraft & { requestId: string }) | null
	>(null);
	const [busy, setBusy] = useState(false);
	const [photoPhase, setPhotoPhase] = useState<
		"idle" | "queued" | "analyzing" | "failed"
	>("idle");
	const [failure, setFailure] = useState("");

	async function upload(file: File) {
		if (!online || !photoLog) return;
		if (
			file.type !== "image/jpeg" &&
			file.type !== "image/png" &&
			file.type !== "image/webp"
		) {
			setFailure("Use a JPEG, PNG, or WebP photo.");
			setPhotoPhase("failed");
			return;
		}
		if (!deviceFuelTimeZone()) {
			onError(FUEL_ZONE_UNUSABLE);
			return;
		}
		setBusy(true);
		setReview(null);
		setFailure("");
		setPhotoPhase("queued");
		onError("");
		const encoded = await fuelPhotoJpeg(file);
		if (!encoded) {
			setBusy(false);
			setFailure("That photo was not queued.");
			setPhotoPhase("failed");
			return;
		}
		if (encoded.bytes.byteLength > FUEL_PHOTO_MAX_BYTES) {
			setBusy(false);
			setFailure("That photo is over 3 MB.");
			setPhotoPhase("failed");
			return;
		}
		let binary = "";
		for (const byte of encoded.bytes) binary += String.fromCharCode(byte);
		const controller = new AbortController();
		pollAbort.current?.abort();
		pollAbort.current = controller;
		let settled = false;
		try {
			const payload = {
				operationKey: crypto.randomUUID(),
				contentType: "image/jpeg",
				imageBase64: btoa(binary),
			};
			const send = () =>
				fetch("/api/nutrition/diary/photo", {
					method: "POST",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json" },
					signal: controller.signal,
					body: JSON.stringify(withDeviceFuelZone(payload)),
				});
			const response = await retryFuelZoneOnce(await send(), send);
			const body = (await response.json().catch(() => null)) as {
				code?: string;
				error?: string;
				requestId?: string;
			} | null;
			if (body?.code === "fuel_daily_limit") {
				onLimit();
				return;
			}
			if (!response.ok || !body?.requestId) {
				setFailure(body?.error ?? "That photo was not queued.");
				setPhotoPhase("failed");
				return;
			}
			const polled = await pollFuelPhoto(body.requestId, {
				signal: controller.signal,
				onStatus: (status) => {
					if (status === "queued" || status === "analyzing") {
						setPhotoPhase(status);
					}
				},
			});
			if (polled.status !== "ready_to_review" || !polled.lines?.length) {
				setFailure(polled.error ?? `Photo status: ${polled.status}.`);
				setPhotoPhase("failed");
				return;
			}
			setReview({
				requestId: body.requestId,
				...fuelPhotoReviewFromLines(polled.lines),
			});
			setPhotoPhase("idle");
			settled = true;
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") return;
			setFailure("That photo was not queued.");
			setPhotoPhase("failed");
		} finally {
			setBusy(false);
			if (!settled && photoPhase === "queued") {
				/* failed or still showing the analyzing card */
			}
		}
	}

	async function confirm() {
		if (!review) return;
		if (!deviceFuelTimeZone()) {
			onError(FUEL_ZONE_UNUSABLE);
			return;
		}
		const key = crypto.randomUUID();
		const payload = fuelPhotoApproveBody(review, {
			idempotencyKey: key,
			operationKey: key,
			occurredAt: new Date().toISOString(),
		});
		if (!payload) {
			onError("Add a name, amount, and unit.");
			return;
		}
		setBusy(true);
		const send = () =>
			fetch(`/api/nutrition/diary/photo/${review.requestId}/confirm`, {
				method: "POST",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(withDeviceFuelZone(payload)),
			});
		const response = await retryFuelZoneOnce(await send(), send);
		const body = (await response.json().catch(() => null)) as {
			code?: string;
		} | null;
		setBusy(false);
		if (body?.code === "fuel_daily_limit") {
			onLimit();
			return;
		}
		if (!response.ok) {
			onError("That meal was not saved.");
			return;
		}
		onSaved();
	}

	const analyzing = photoPhase === "queued" || photoPhase === "analyzing";

	return (
		<div className="space-y-3 rounded-xl border border-platinum p-4">
			<h2 className="text-base">Scan to Fuel</h2>
			{review ? (
				<form
					className="space-y-2"
					onSubmit={(event) => {
						event.preventDefault();
						void confirm();
					}}
				>
					<p className="text-sm">Ready to review</p>
					<p className="text-sm text-muted">1 item found</p>
					<p className="text-sm text-muted">
						Tap edit to adjust name, amount, unit, calories, protein, carbs, or
						fat.
					</p>
					<label className="block text-sm">
						Name
						<input
							value={review.name}
							aria-label="Name"
							className="mt-1 block min-h-11 w-full"
							onChange={(event) =>
								setReview({ ...review, name: event.target.value })
							}
						/>
					</label>
					<label className="block text-sm">
						Amount
/* FUEL_PAGE_REST */
