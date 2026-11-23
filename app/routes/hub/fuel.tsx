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
import { AiWait } from "~/components/ai/AiWait";
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
import { loadFuelDay } from "~/lib/nutrition/fuel-read.server";
import {
	FUEL_SCAN_ANALYZING,
	FUEL_SCAN_ANALYZING_DETAIL,
	FUEL_SCAN_NEXT_STEPS,
	FUEL_SCAN_NOT_MEDICAL,
	FUEL_SCAN_UNAVAILABLE,
} from "~/lib/nutrition/fuel-scan-copy";
import {
	deviceFuelTimeZone,
	FUEL_ZONE_UNUSABLE,
	retryFuelZoneOnce,
	withDeviceFuelZone,
} from "~/lib/nutrition/fuel-zone-client";
import { healthExportPreferenceEnabled } from "~/lib/nutrition/health-export-client";
import {
	HEALTH_ESTIMATE_ACCEPT_NOTE,
	healthEstimateAcceptNeeded,
	intakeCompositionAfterEstimate,
	nutrientAmountsEdited,
} from "~/lib/nutrition/health-exportability";
import type { NutritionSnapshot } from "~/lib/nutrition/types";
import { FUEL_PHOTO_MAX_BYTES } from "~/lib/schemas/fuel";
import type { Route } from "./+types/fuel";

const APPLE_HEALTH_REMAINS =
	"Apple Health samples Ration already wrote stay in the Health app until you delete them there. A deletion started on another device cannot remove them.";

function openFuelPurchase() {
	window.location.assign("/hub/pricing");
}

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
	return {
		day,
		healthNote: APPLE_HEALTH_REMAINS,
		credits,
		scanCreditCost: AI_COSTS.SCAN,
	};
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
	const { day, credits, scanCreditCost } = loaderData;
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
			openFuelPurchase();
			return;
		}
		setShowScan(true);
	});

	function openCreate(kind: "add" | "scan" | "barcode") {
		if (!online) return;
		if (capped) {
			openFuelPurchase();
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
		fuelDate: string;
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
		if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.fuelDate)) {
			setPendingName(null);
			setError("Pick a date.");
			return;
		}
		const operationKey = crypto.randomUUID();
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 15000);
		try {
			const payload = {
				name: entry.name,
				fuelDate: entry.fuelDate,
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
				if (body?.code === "fuel_daily_limit") openFuelPurchase();
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
					scanCreditCost={scanCreditCost}
					defaultDate={day.date}
					onClose={() => setShowScan(false)}
					onLimit={() => openFuelPurchase()}
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
					onLimit={() => openFuelPurchase()}
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
								{item.estimate ? " · AI estimate" : ""}
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
					defaultDate={day.date}
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
	scanCreditCost,
	onClose,
	onLimit,
	onSaved,
	onError,
	pollAbort,
}: {
	online: boolean;
	photoLog: boolean;
	credits: number;
	scanCreditCost: number;
	onClose: () => void;
	onLimit: () => void;
	onSaved: () => void;
	onError: (message: string) => void;
	pollAbort: { current: AbortController | null };
}) {
	const [review, setReview] = useState<
		| (FuelPhotoReviewDraft & {
				requestId: string;
				originalEnergy: number;
				originalProtein: number;
				originalCarbs: number;
				originalFat: number;
		  })
		| null
	>(null);
	const [askingAccept, setAskingAccept] = useState(false);
	const [busy, setBusy] = useState(false);
	const [photoPhase, setPhotoPhase] = useState<
		"idle" | "queued" | "analyzing" | "failed"
	>("idle");
	const [failure, setFailure] = useState("");
	const closeRef = useRef<HTMLButtonElement>(null);
	const waitWasOpen = useRef(false);

	useEffect(() => {
		const active = photoPhase === "queued" || photoPhase === "analyzing";
		if (active && !waitWasOpen.current) closeRef.current?.focus();
		waitWasOpen.current = active;
	}, [photoPhase]);

	function dismissWait() {
		pollAbort.current?.abort();
		onClose();
	}

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
		setAskingAccept(false);
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
			const draft = fuelPhotoReviewFromLines(polled.lines);
			setReview({
				requestId: body.requestId,
				...draft,
				originalEnergy: Number(draft.energy),
				originalProtein: Number(draft.protein),
				originalCarbs: Number(draft.carbs),
				originalFat: Number(draft.fat),
			});
			setAskingAccept(false);
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

	async function confirm(accepted?: boolean) {
		if (!review) return;
		if (!deviceFuelTimeZone()) {
			onError(FUEL_ZONE_UNUSABLE);
			return;
		}
		const amountsEdited = nutrientAmountsEdited(
			{
				energyKcal: review.originalEnergy,
				proteinG: review.originalProtein,
				carbsG: review.originalCarbs,
				fatG: review.originalFat,
			},
			{
				energyKcal: Number(review.energy),
				proteinG: Number(review.protein),
				carbsG: Number(review.carbs),
				fatG: Number(review.fat),
			},
		);
		if (
			accepted === undefined &&
			healthEstimateAcceptNeeded({
				healthExportEnabled: await healthExportPreferenceEnabled(),
				compositionSource: "ai_estimate",
				amountsEdited,
			})
		) {
			setAskingAccept(true);
			return;
		}
		const compositionSource = intakeCompositionAfterEstimate({
			compositionSource: "ai_estimate",
			amountsEdited,
			accepted: accepted === true,
		});
		const key = crypto.randomUUID();
		const payload = fuelPhotoApproveBody(
			review,
			{
				idempotencyKey: key,
				operationKey: key,
				occurredAt: new Date().toISOString(),
			},
			compositionSource === "user_override" ? "user_override" : "ai_estimate",
		);
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

	if (analyzing) {
		return (
			<div
				className="ai-wait-screen"
				role="dialog"
				aria-modal="true"
				aria-labelledby="fuel-scan-wait-title"
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						dismissWait();
						return;
					}
					if (event.key === "Tab") {
						event.preventDefault();
						closeRef.current?.focus();
					}
				}}
			>
				<div className="ai-wait-bar">
					<button
						ref={closeRef}
						type="button"
						className="ai-wait-close"
						onClick={dismissWait}
					>
						Close
					</button>
					<h2 id="fuel-scan-wait-title" className="ai-wait-screen-title">
						Scan to Fuel
					</h2>
					<span aria-hidden="true" />
				</div>
				<AiWait
					mark="fuel"
					title={FUEL_SCAN_ANALYZING}
					detail={FUEL_SCAN_ANALYZING_DETAIL}
					creditCost={scanCreditCost}
					className="flex-1"
				/>
			</div>
		);
	}

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
						AI estimate. Adjust any number before you add it.
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
						<input
							value={review.amount}
							inputMode="decimal"
							aria-label="Amount"
							className="mt-1 block min-h-11 w-full"
							onChange={(event) =>
								setReview({ ...review, amount: event.target.value })
							}
						/>
					</label>
					<label className="block text-sm">
						Unit
						<input
							value={review.unit}
							aria-label="Unit"
							className="mt-1 block min-h-11 w-full"
							onChange={(event) =>
								setReview({ ...review, unit: event.target.value })
							}
						/>
					</label>
					<label className="block text-sm">
						Calories (kcal)
						<input
							value={review.energy}
							inputMode="decimal"
							aria-label="Calories (kcal)"
							className="mt-1 block min-h-11 w-full"
							onChange={(event) =>
								setReview({ ...review, energy: event.target.value })
							}
						/>
					</label>
					<label className="block text-sm">
						Protein (g)
						<input
							value={review.protein}
							inputMode="decimal"
							aria-label="Protein (g)"
							className="mt-1 block min-h-11 w-full"
							onChange={(event) =>
								setReview({ ...review, protein: event.target.value })
							}
						/>
					</label>
					<label className="block text-sm">
						Carbs (g)
						<input
							value={review.carbs}
							inputMode="decimal"
							aria-label="Carbs (g)"
							className="mt-1 block min-h-11 w-full"
							onChange={(event) =>
								setReview({ ...review, carbs: event.target.value })
							}
						/>
					</label>
					<label className="block text-sm">
						Fat (g)
						<input
							value={review.fat}
							inputMode="decimal"
							aria-label="Fat (g)"
							className="mt-1 block min-h-11 w-full"
							onChange={(event) =>
								setReview({ ...review, fat: event.target.value })
							}
						/>
					</label>
					{askingAccept ? (
						<div className="space-y-2">
							<p className="text-sm">{HEALTH_ESTIMATE_ACCEPT_NOTE}</p>
							<div className="flex gap-2">
								<button
									type="button"
									className="min-h-11 rounded-xl bg-carbon px-4 text-ceramic"
									onClick={() => void confirm(true)}
								>
									Accept
								</button>
								<button
									type="button"
									className="min-h-11 rounded-xl border border-platinum px-4"
									onClick={() => void confirm(false)}
								>
									Skip
								</button>
							</div>
						</div>
					) : (
						<button
							type="submit"
							className="min-h-11 rounded-xl bg-carbon px-4 text-ceramic"
						>
							Add to Fuel
						</button>
					)}
					<button
						type="button"
						className="min-h-11 text-sm underline"
						onClick={() => {
							setReview(null);
							setAskingAccept(false);
							setPhotoPhase("idle");
						}}
					>
						Scan another
					</button>
				</form>
			) : photoPhase === "failed" ? (
				<div className="space-y-2">
					<p className="text-sm">{failure}</p>
					<button
						type="button"
						className="min-h-11 text-sm underline"
						onClick={() => {
							setFailure("");
							setPhotoPhase("idle");
						}}
					>
						Try again
					</button>
				</div>
			) : (
				<div className="space-y-2">
					<p className="text-sm">
						A plate, a set of ingredients, one item, or a drink. The estimate is
						from what is visible.
					</p>
					<p className="text-sm">{FUEL_SCAN_NEXT_STEPS}</p>
					<p className="text-sm">
						Uses {scanCreditCost} credits per photo. You have {credits}.
					</p>
					<p className="text-sm text-muted">{FUEL_SCAN_NOT_MEDICAL}</p>
					<p className="text-sm text-muted">
						AI-generated results are suggestions only. Always review before
						saving.
					</p>
					{photoLog ? (
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp"
							capture="environment"
							aria-label="Open camera"
							className="min-h-11"
							disabled={!online || busy}
							onChange={(event) => {
								const file = event.target.files?.[0];
								if (file) void upload(file);
							}}
						/>
					) : (
						<p className="text-sm">{FUEL_SCAN_UNAVAILABLE}</p>
					)}
				</div>
			)}
			<button
				type="button"
				className="min-h-11 text-sm underline"
				onClick={onClose}
			>
				Close
			</button>
		</div>
	);
}

async function fuelPhotoJpeg(
	file: File,
): Promise<{ bytes: Uint8Array } | null> {
	const bitmap = await createImageBitmap(file);
	const size = fuelPhotoPixelSize(bitmap.width, bitmap.height);
	const canvas = document.createElement("canvas");
	canvas.width = size.width;
	canvas.height = size.height;
	const context = canvas.getContext("2d");
	if (!context) return null;
	context.drawImage(bitmap, 0, 0, size.width, size.height);
	const blob = await new Promise<Blob | null>((resolve) => {
		canvas.toBlob((next) => resolve(next), "image/jpeg", 0.92);
	});
	bitmap.close();
	if (!blob) return null;
	return { bytes: new Uint8Array(await blob.arrayBuffer()) };
}

function BarcodeToFuel({
	online,
	onClose,
	onLimit,
	onSaved,
	onError,
}: {
	online: boolean;
	onClose: () => void;
	onLimit: () => void;
	onSaved: () => void;
	onError: (message: string) => void;
}) {
	const [code, setCode] = useState("");
	const [hit, setHit] = useState<{
		name: string;
		energy: number;
		protein: number;
		carbs: number;
		fat: number;
	} | null>(null);
	const started = useRef(false);

	useEffect(() => {
		if (started.current || !online) return;
		started.current = true;
		const Detector = (
			window as Window & {
				BarcodeDetector?: new (options: {
					formats: string[];
				}) => {
					detect: (
						source: ImageBitmapSource,
					) => Promise<Array<{ rawValue: string }>>;
				};
			}
		).BarcodeDetector;
		if (!Detector || !navigator.mediaDevices?.getUserMedia) return;
		const video = document.createElement("video");
		let stream: MediaStream | null = null;
		let stopped = false;
		void (async () => {
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: "environment" },
				});
				if (stopped) {
					for (const track of stream.getTracks()) track.stop();
					return;
				}
				video.srcObject = stream;
				await video.play();
				const detector = new Detector({
					formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
				});
				const found = await detector.detect(video);
				const value = found[0]?.rawValue?.replace(/\D/g, "") ?? "";
				if (value) setCode(value);
			} catch {
				onError("The camera is off. Type the barcode.");
			} finally {
				if (stream) for (const track of stream.getTracks()) track.stop();
			}
		})();
		return () => {
			stopped = true;
			if (stream) for (const track of stream.getTracks()) track.stop();
		};
	}, [online, onError]);

	async function lookup() {
		if (!online) return;
		if (!deviceFuelTimeZone()) {
			onError(FUEL_ZONE_UNUSABLE);
			return;
		}
		const payload = { barcode: code };
		const send = () =>
			fetch("/api/nutrition/diary/barcode", {
				method: "POST",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(withDeviceFuelZone(payload)),
			});
		const response = await retryFuelZoneOnce(await send(), send);
		const body = (await response.json().catch(() => null)) as {
			code?: string;
			found?: boolean;
			name?: string;
			macros?: {
				energyKcal: number;
				proteinG: number;
				carbsG: number;
				fatG: number;
			};
		} | null;
		if (body?.code === "fuel_daily_limit") {
			onLimit();
			return;
		}
		if (!response.ok || !body?.found || !body.name || !body.macros) {
			onError("No food matched that barcode.");
			return;
		}
		setHit({
			name: body.name,
			energy: body.macros.energyKcal,
			protein: body.macros.proteinG,
			carbs: body.macros.carbsG,
			fat: body.macros.fatG,
		});
	}

	async function confirm() {
		if (!hit) return;
		if (!deviceFuelTimeZone()) {
			onError(FUEL_ZONE_UNUSABLE);
			return;
		}
		const payload = {
			name: hit.name,
			occurredAt: new Date().toISOString(),
			amount: 1,
			unit: "serving",
			macros: {
				energyKcal: hit.energy,
				proteinG: hit.protein,
				carbsG: hit.carbs,
				fatG: hit.fat,
			},
			idempotencyKey: crypto.randomUUID(),
			operationKey: crypto.randomUUID(),
			compositionSource: "usda" as const,
		};
		const send = () =>
			fetch("/api/nutrition/diary", {
				method: "POST",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(withDeviceFuelZone(payload)),
			});
		const response = await retryFuelZoneOnce(await send(), send);
		const body = (await response.json().catch(() => null)) as {
			code?: string;
		} | null;
		if (body?.code === "fuel_daily_limit") {
			onLimit();
			return;
		}
		if (!response.ok) {
			onError("That barcode was not logged.");
			return;
		}
		onSaved();
	}

	return (
		<div className="space-y-3 rounded-xl border border-platinum p-4">
			<label className="block text-sm">
				Barcode
				<input
					value={code}
					inputMode="numeric"
					aria-label="Barcode"
					className="mt-1 block min-h-11 w-full"
					onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
				/>
			</label>
			<button
				type="button"
				className="min-h-11 rounded-xl bg-carbon px-4 text-ceramic"
				disabled={!online || code.length < 8}
				onClick={() => void lookup()}
			>
				Look up
			</button>
			{hit ? (
				<button
					type="button"
					className="min-h-11 rounded-xl border border-platinum px-4 text-sm"
					onClick={() => void confirm()}
				>
					Confirm {hit.name}
				</button>
			) : null}
			<button
				type="button"
				className="min-h-11 text-sm underline"
				onClick={onClose}
			>
				Close
			</button>
		</div>
	);
}
type AddFuelTag = { name: string; slug?: string };
type AddFuelCargo = {
	id: string;
	name: string;
	unit: string;
	tags?: AddFuelTag[];
	nutrition?: NutritionSnapshot | null;
};
type AddFuelMeal = {
	id: string;
	name: string;
	tags?: AddFuelTag[];
	nutrition?: {
		perServing?: {
			energyKcal?: number | null;
			proteinG?: number | null;
			carbG?: number | null;
			fatG?: number | null;
		} | null;
	} | null;
};

function AddFuelPanel({
	onSave,
}: {
	onSave: (entry: {
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
		tagNames: AddFuelTag[];
	}) => void;
}) {
	const [query, setQuery] = useState("");
	const [cargoPage, setCargoPage] = useState<AddFuelCargo[]>([]);
	const [searchHits, setSearchHits] = useState<
		{ id: string; name: string; unit: string }[]
	>([]);
	const [meals, setMeals] = useState<AddFuelMeal[]>([]);
	const [selected, setSelected] = useState<string[]>([]);
	const [name, setName] = useState("");
	const [amount, setAmount] = useState("1");
	const [unit, setUnit] = useState("serving");
	const [energy, setEnergy] = useState("");
	const [protein, setProtein] = useState("");
	const [carbs, setCarbs] = useState("");
	const [fat, setFat] = useState("");
	const [tags, setTags] = useState("");
	const [source, setSource] = useState<"manual_macros" | "meal">("manual_macros");
	const [pickedTags, setPickedTags] = useState<AddFuelTag[]>([]);
	const [pickedCargo, setPickedCargo] = useState<AddFuelCargo | null>(null);
	const [pickedMeal, setPickedMeal] = useState<AddFuelMeal | null>(null);
	const [touched, setTouched] = useState<Set<string>>(new Set());
	const [formError, setFormError] = useState<string | null>(null);
	const searchedMeals = useRef(false);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const [cargoRes, mealRes] = await Promise.all([
				fetch("/api/cargo?limit=50", { credentials: "same-origin" }),
				fetch("/api/meals?limit=50", { credentials: "same-origin" }),
			]);
			if (cancelled) return;
			if (cargoRes.ok) {
				const body = (await cargoRes.json()) as { items?: AddFuelCargo[] };
				setCargoPage(body.items ?? []);
			}
			if (mealRes.ok) {
				const body = (await mealRes.json()) as { meals?: AddFuelMeal[] };
				setMeals(body.meals ?? []);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		const text = query.trim();
		if (text.length < 2) {
			setSearchHits([]);
			if (!searchedMeals.current) return;
			searchedMeals.current = false;
			void (async () => {
				const mealRes = await fetch("/api/meals?limit=50", {
					credentials: "same-origin",
				});
				if (!mealRes.ok) return;
				const body = (await mealRes.json()) as { meals?: AddFuelMeal[] };
				setMeals(body.meals ?? []);
			})();
			return;
		}
		searchedMeals.current = true;
		const handle = setTimeout(() => {
			void (async () => {
				const [searchRes, mealRes] = await Promise.all([
					fetch(`/api/search?q=${encodeURIComponent(text)}`, {
						credentials: "same-origin",
					}),
					fetch(`/api/meals?q=${encodeURIComponent(text)}`, {
						credentials: "same-origin",
					}),
				]);
				if (searchRes.ok) {
					const body = (await searchRes.json()) as {
						results?: { id: string; name: string; unit: string }[];
					};
					setSearchHits(body.results ?? []);
				}
				if (mealRes.ok) {
					const body = (await mealRes.json()) as { meals?: AddFuelMeal[] };
					setMeals(body.meals ?? []);
				}
			})();
		}, 200);
		return () => clearTimeout(handle);
	}, [query]);

	const suggestions = [
		...new Set(
			[...cargoPage.flatMap((item) => item.tags ?? []), ...meals.flatMap((meal) => meal.tags ?? [])]
				.map((tag) => tag.name)
				.filter((name) => name.length > 0),
		),
	].sort();

	const needle = query.trim().toLowerCase();
	const cargoRows =
		needle.length >= 2
			? searchHits
			: cargoPage
					.filter((item) =>
						needle.length === 0
							? true
							: item.name.toLowerCase().includes(needle),
					)
					.map((item) => ({ id: item.id, name: item.name, unit: item.unit }));
	const visibleCargo = cargoRows
		.filter((row) => {
			const item = cargoPage.find((candidate) => candidate.id === row.id);
			if (!item) return selected.length === 0;
			return matchesTagDisplayNames(item.tags ?? [], selected);
		})
		.slice(0, 20);
	const visibleMeals = meals
		.filter(
			(meal) =>
				(needle.length === 0 || meal.name.toLowerCase().includes(needle)) &&
				matchesTagDisplayNames(meal.tags ?? [], selected),
		)
		.slice(0, 20);

	function applyMacros(
		next: { energyKcal: number; proteinG: number; carbsG: number; fatG: number } | null,
	) {
		if (!next) return;
		if (!touched.has("energy")) setEnergy(String(next.energyKcal));
		if (!touched.has("protein")) setProtein(String(next.proteinG));
		if (!touched.has("carbs")) setCarbs(String(next.carbsG));
		if (!touched.has("fat")) setFat(String(next.fatG));
	}

	async function pickCargo(id: string) {
		const response = await fetch(`/api/cargo/${id}`, { credentials: "same-origin" });
		if (!response.ok) return;
		const body = (await response.json()) as { item?: AddFuelCargo };
		const item = body.item;
		if (!item) return;
		setName(item.name);
		setUnit(item.unit);
		setAmount("1");
		setSource("manual_macros");
		setPickedCargo(item);
		setPickedMeal(null);
		setPickedTags(item.tags ?? []);
		setTags((item.tags ?? []).map((tag) => tag.name).join(", "));
		setTouched(new Set());
		const scaled = cargoAddFuelMacros({
			nutrition: item.nutrition,
			quantity: 1,
			unit: item.unit,
		});
		if (scaled) {
			setEnergy(String(scaled.energyKcal));
			setProtein(String(scaled.proteinG));
			setCarbs(String(scaled.carbsG));
			setFat(String(scaled.fatG));
		}
	}

	function pickMeal(meal: AddFuelMeal) {
		const per = meal.nutrition?.perServing;
		setName(meal.name);
		setUnit("serving");
		setAmount("1");
		setSource("meal");
		setPickedMeal(meal);
		setPickedCargo(null);
		setPickedTags(meal.tags ?? []);
		setTags((meal.tags ?? []).map((tag) => tag.name).join(", "));
		setTouched(new Set());
		const scaled = mealAddFuelMacros(
			{
				energyKcal: per?.energyKcal ?? 0,
				proteinG: per?.proteinG ?? 0,
				carbsG: per?.carbG ?? 0,
				fatG: per?.fatG ?? 0,
			},
			1,
		);
		if (scaled) {
			setEnergy(String(scaled.energyKcal));
			setProtein(String(scaled.proteinG));
			setCarbs(String(scaled.carbsG));
			setFat(String(scaled.fatG));
		}
	}

	function rescale(nextAmount: string, nextUnit = unit) {
		setAmount(nextAmount);
		const quantity = Number(nextAmount);
		if (!(quantity > 0)) return;
		if (pickedMeal) {
			const per = pickedMeal.nutrition?.perServing;
			if (!per) return;
			applyMacros(
				mealAddFuelMacros(
					{
						energyKcal: per.energyKcal ?? 0,
						proteinG: per.proteinG ?? 0,
						carbsG: per.carbG ?? 0,
						fatG: per.fatG ?? 0,
					},
					quantity,
				),
			);
			return;
		}
		if (!pickedCargo?.nutrition) return;
		applyMacros(
			cargoAddFuelMacros({
				nutrition: pickedCargo.nutrition,
				quantity,
				unit: nextUnit,
			}),
		);
	}

	return (
		<form
			className="space-y-3 rounded-xl border border-platinum p-4"
			onSubmit={(event) => {
				event.preventDefault();
				const entry = manualFuelEntry({
					name,
					amount: Number(amount),
					unit,
					energyKcal: Number(energy),
					proteinG: Number(protein || "0"),
					carbsG: Number(carbs || "0"),
					fatG: Number(fat || "0"),
					tagNames: tags.split(",").map((tag) => tag.trim()),
				});
				if (!entry) {
					setFormError(
						"Check the name, amount, and macros. Use at most 10 tags, each 100 characters or fewer.",
					);
					return;
				}
				setFormError(null);
				const named = entry.tagNames.map((tag) => {
					const known = pickedTags.find((row) => row.name === tag);
					return known?.slug ? { name: tag, slug: known.slug } : { name: tag };
				});
				onSave({
					name: entry.name,
					amount: entry.amount,
					unit: entry.unit,
					macros: entry.macros,
					compositionSource: source,
					tagNames: named,
				});
			}}
		>
			<h2 className="text-base">Add Fuel</h2>
			{formError ? <p className="text-sm text-carbon">{formError}</p> : null}
			<label className="block text-sm">
				Search
				<input
					value={query}
					aria-label="Search Cargo and Galley"
					className="mt-1 block min-h-11 w-full"
					onChange={(event) => setQuery(event.target.value)}
				/>
			</label>
			{suggestions.length > 0 ? (
				<div className="flex flex-wrap gap-2">
					{suggestions.map((tag) => (
						<button
							key={tag}
							type="button"
							aria-pressed={selected.includes(tag)}
							className="min-h-11 rounded-full border border-platinum px-3 text-sm"
							onClick={() =>
								setSelected((current) =>
									current.includes(tag)
										? current.filter((name) => name !== tag)
										: [...current, tag],
								)
							}
						>
							{tag}
						</button>
					))}
				</div>
			) : null}
			<ul className="space-y-1">
				{visibleCargo.map((row) => (
					<li key={`cargo-${row.id}`}>
						<button
							type="button"
							className="min-h-11 text-sm underline"
							onClick={() => void pickCargo(row.id)}
						>
							{row.name}
						</button>
					</li>
				))}
				{visibleMeals.map((meal) => (
					<li key={`meal-${meal.id}`}>
						<button
							type="button"
							className="min-h-11 text-sm underline"
							onClick={() => pickMeal(meal)}
						>
							{meal.name}
						</button>
					</li>
				))}
			</ul>
			<label className="block text-sm">
				Name
				<input
					value={name}
					required
					className="mt-1 block min-h-11 w-full"
					onChange={(event) => setName(event.target.value)}
				/>
			</label>
			<label className="block text-sm">
				Amount
				<input
					value={amount}
					type="number"
					min="0.01"
					step="any"
					required
					className="mt-1 block min-h-11 w-full"
					onChange={(event) => rescale(event.target.value)}
				/>
			</label>
			<label className="block text-sm">
				Unit
				<input
					value={unit}
					required
					className="mt-1 block min-h-11 w-full"
					onChange={(event) => {
						const nextUnit = event.target.value;
						setUnit(nextUnit);
						if (!pickedMeal) rescale(amount, nextUnit);
					}}
				/>
			</label>
			<label className="block text-sm">
				Calories (kcal)
				<input
					value={energy}
					type="number"
					min="0"
					step="any"
					required
					className="mt-1 block min-h-11 w-full"
					onChange={(event) => {
						setTouched((current) => new Set(current).add("energy"));
						setEnergy(event.target.value);
					}}
				/>
			</label>
			<label className="block text-sm">
				Protein (g)
				<input
					value={protein}
					type="number"
					min="0"
					step="any"
					className="mt-1 block min-h-11 w-full"
					onChange={(event) => {
						setTouched((current) => new Set(current).add("protein"));
						setProtein(event.target.value);
					}}
				/>
			</label>
			<label className="block text-sm">
				Carbs (g)
				<input
					value={carbs}
					type="number"
					min="0"
					step="any"
					className="mt-1 block min-h-11 w-full"
					onChange={(event) => {
						setTouched((current) => new Set(current).add("carbs"));
						setCarbs(event.target.value);
					}}
				/>
			</label>
			<label className="block text-sm">
				Fat (g)
				<input
					value={fat}
					type="number"
					min="0"
					step="any"
					className="mt-1 block min-h-11 w-full"
					onChange={(event) => {
						setTouched((current) => new Set(current).add("fat"));
						setFat(event.target.value);
					}}
				/>
			</label>
			<label className="block text-sm">
				Tags
				<input
					value={tags}
					aria-label="Tags"
					className="mt-1 block min-h-11 w-full"
					onChange={(event) => setTags(event.target.value)}
				/>
			</label>
			<button
				type="submit"
				className="min-h-11 rounded-xl bg-carbon px-4 text-ceramic"
			>
				Add to Fuel
			</button>
		</form>
	);
}
