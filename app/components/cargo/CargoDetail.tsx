import { useEffect, useRef, useState } from "react";
import {
	Link,
	useFetcher,
	useRevalidator,
	useRouteLoaderData,
} from "react-router";
import { CargoEditModal } from "~/components/cargo/CargoEditModal";
import { CargoQuickEatDialog } from "~/components/cargo/CargoQuickEatDialog";
import { RestockQuantityModal } from "~/components/cargo/RestockQuantityModal";
import { StatusGauge } from "~/components/cargo/StatusGauge";
import { CheckIcon, PlusIcon } from "~/components/icons/PageIcons";
import { NutritionPanel } from "~/components/nutrition/NutritionPanel";
import { DisplayQuantity } from "~/components/shared/DisplayQuantity";
import { TagChip } from "~/components/shared/TagChip";
import { Toast } from "~/components/shell/Toast";
import type { cargo } from "~/db/schema";
import { useToast } from "~/hooks/useToast";
import { useConfirm } from "~/lib/confirm-context";
import type { NutritionSnapshot } from "~/lib/nutrition";
import type { TagRecord } from "~/lib/tags";
import { toSupportedUnit } from "~/lib/units";

type CargoWithTags = typeof cargo.$inferSelect & { tags: TagRecord[] };

type ConnectedIngredient = {
	id: string;
	ingredientName: string;
	quantity: number;
	unit: string;
	connectionType: "direct" | "name_match";
};

type ConnectedMeal = {
	id: string;
	name: string;
	description: string | null;
	tags: TagRecord[];
	connectedIngredients: ConnectedIngredient[];
};

interface CargoDetailProps {
	item: CargoWithTags;
	connectedMeals: ConnectedMeal[];
	tagSuggestions?: string[];
	isRestockSelected?: boolean;
}

function formatExpiryDate(expiresAt: Date | null): string {
	if (!expiresAt) return "No expiry";
	const parsed = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
	if (Number.isNaN(parsed.getTime())) return "No expiry";
	return parsed.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function getConnectionLabel(connectionType: "direct" | "name_match") {
	return connectionType === "direct" ? "Direct Link" : "Name Match";
}

export function CargoDetail({
	item,
	connectedMeals,
	tagSuggestions = [],
	isRestockSelected = false,
}: CargoDetailProps) {
	const fetcher = useFetcher<{ success?: boolean; error?: string }>();
	const restockFetcher = useFetcher<{
		success: boolean;
		cargoId: string;
		isActive: boolean;
	}>();
	const [isEditing, setIsEditing] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [localRestockSelected, setLocalRestockSelected] =
		useState(isRestockSelected);
	const [showRestockModal, setShowRestockModal] = useState(false);
	const [localQuantity, setLocalQuantity] = useState(item.quantity);
	const [markEmptyError, setMarkEmptyError] = useState<string | null>(null);
	const [lastIntent, setLastIntent] = useState<string | null>(null);
	const { confirm } = useConfirm();
	const revalidator = useRevalidator();
	const tags = item.tags ?? [];
	const currentIntent = fetcher.formData?.get("intent") as string | null;
	const isUpdating = fetcher.state !== "idle" && currentIntent === "update";
	const isMarkingEmpty =
		fetcher.state !== "idle" && currentIntent === "mark-empty";
	const rootData = useRouteLoaderData("root") as
		| {
				clientFlags?: {
					nutritionEngine?: boolean;
					cargoQuickEat?: boolean;
					nutritionIntakeNotes?: boolean;
				};
		  }
		| undefined;
	const nutritionEngine = rootData?.clientFlags?.nutritionEngine === true;
	const cargoQuickEat = rootData?.clientFlags?.cargoQuickEat === true;
	const nutritionIntakeNotes =
		rootData?.clientFlags?.nutritionIntakeNotes === true;
	const [showQuickEat, setShowQuickEat] = useState(false);
	const eatToast = useToast({ duration: 4000 });
	const nutritionRefreshFetcher = useFetcher<{
		matched?: boolean;
		nutrition?: NutritionSnapshot | null;
		message?: string;
		error?: string;
	}>();
	const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
	const isRefreshingNutrition = nutritionRefreshFetcher.state !== "idle";
	const wasRefreshingNutrition = useRef(false);

	useEffect(() => {
		if (fetcher.state === "idle") {
			setIsDeleting(false);
		}
	}, [fetcher.state]);

	useEffect(() => {
		if (fetcher.state !== "idle" && currentIntent) {
			setLastIntent(currentIntent);
		}
	}, [fetcher.state, currentIntent]);

	useEffect(() => {
		setLocalQuantity(item.quantity);
	}, [item.quantity]);

	useEffect(() => {
		if (nutritionRefreshFetcher.state !== "idle") {
			wasRefreshingNutrition.current = true;
			return;
		}
		if (!wasRefreshingNutrition.current) return;
		wasRefreshingNutrition.current = false;
		const data = nutritionRefreshFetcher.data;
		if (!data) return;
		if (data.error) {
			setRefreshMessage(data.error);
			return;
		}
		setRefreshMessage(data.matched ? null : (data.message ?? null));
		revalidator.revalidate();
	}, [
		nutritionRefreshFetcher.state,
		nutritionRefreshFetcher.data,
		revalidator,
	]);

	useEffect(() => {
		if (fetcher.state !== "idle" || lastIntent !== "mark-empty") return;
		if (fetcher.data?.success === false) {
			setMarkEmptyError(fetcher.data.error ?? "Could not mark item empty.");
			setLocalQuantity(item.quantity);
		}
		setLastIntent(null);
	}, [fetcher.state, fetcher.data, lastIntent, item.quantity]);

	useEffect(() => {
		setLocalRestockSelected(isRestockSelected);
	}, [isRestockSelected]);

	useEffect(() => {
		if (!restockFetcher.data?.cargoId) return;
		if (restockFetcher.data.cargoId !== item.id) return;
		setLocalRestockSelected(restockFetcher.data.isActive);
	}, [restockFetcher.data, item.id]);

	useEffect(() => {
		if (isEditing && fetcher.state === "idle" && fetcher.data?.success) {
			setIsEditing(false);
		}
	}, [isEditing, fetcher.state, fetcher.data?.success]);

	const handleToggleRestock = () => {
		if (localRestockSelected) {
			setLocalRestockSelected(false);
			restockFetcher.submit(null, {
				method: "post",
				action: `/api/cargo/${item.id}/toggle-restock`,
			});
			return;
		}
		setShowRestockModal(true);
	};

	const handleRestockConfirm = (quantity: number) => {
		setShowRestockModal(false);
		setLocalRestockSelected(true);
		restockFetcher.submit(JSON.stringify({ quantity }), {
			method: "post",
			action: `/api/cargo/${item.id}/toggle-restock`,
			encType: "application/json",
		});
	};

	const handleDelete = async () => {
		if (
			!(await confirm({
				title: "Delete this ingredient?",
				message: "This cannot be undone.",
				confirmLabel: "Delete",
				variant: "danger",
			}))
		) {
			return;
		}
		setIsDeleting(true);
		fetcher.submit({ intent: "delete", itemId: item.id }, { method: "post" });
	};

	const handleMarkEmpty = () => {
		setMarkEmptyError(null);
		setLocalQuantity(0);
		fetcher.submit(
			{ intent: "mark-empty", itemId: item.id },
			{ method: "post" },
		);
	};

	const handleRefreshNutrition = async () => {
		if (isRefreshingNutrition) return;
		const snap = item.nutrition as NutritionSnapshot | null | undefined;
		if (snap?.source === "user_override") {
			const ok = await confirm({
				title: "Replace manual nutrients?",
				message:
					"This will look up USDA values for this item name and replace your override.",
				confirmLabel: "Refresh",
			});
			if (!ok) return;
		}
		setRefreshMessage(null);
		nutritionRefreshFetcher.submit(null, {
			method: "post",
			action: `/api/cargo/${item.id}/nutrition/refresh`,
		});
	};

	return (
		<div className="max-w-5xl mx-auto space-y-8">
			{markEmptyError && (
				<div className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
					{markEmptyError}
				</div>
			)}
			<div className="glass-panel rounded-xl p-6 border border-platinum/70">
				<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div className="space-y-3">
						<div className="text-label text-muted text-xs">
							Ingredient ID: {item.id.slice(0, 8)}
						</div>
						<h1 className="text-display text-3xl text-carbon">{item.name}</h1>
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-xs px-2 py-1 rounded-full bg-platinum text-carbon uppercase tracking-wide">
								{item.domain}
							</span>
							{tags.map((tag) => (
								<TagChip key={tag.id} tag={tag} size="sm" />
							))}
							{localRestockSelected && (
								<span className="text-xs px-2 py-1 rounded-full bg-hyper-green/15 text-hyper-green font-medium">
									On Supply
								</span>
							)}
						</div>
					</div>

					<div className="flex flex-col items-start md:items-end gap-3">
						<div className="text-right">
							<div className="text-label text-muted text-xs">Available</div>
							<div className="text-data text-2xl font-bold text-carbon">
								<DisplayQuantity
									quantity={localQuantity}
									unit={item.unit}
									baseQuantity={
										localQuantity === 0 ? 0 : (item.baseQuantity ?? undefined)
									}
									baseUnit={item.baseUnit ?? undefined}
									ingredientName={item.name}
								/>
							</div>
						</div>
						<div className="w-full max-w-xs">
							<StatusGauge status={item.status} expiresAt={item.expiresAt} />
						</div>
						<div className="text-xs text-muted">
							Expiry: {formatExpiryDate(item.expiresAt)}
						</div>
						<div className="flex gap-2">
							{cargoQuickEat && (
								<button
									type="button"
									onClick={() => setShowQuickEat(true)}
									className="px-3 py-1.5 text-sm rounded-lg border border-hyper-green/40 text-hyper-green hover:bg-hyper-green/5"
								>
									Eat
								</button>
							)}
							<button
								type="button"
								onClick={() => setIsEditing(true)}
								className="px-3 py-1.5 text-sm rounded-lg border border-platinum text-muted hover:text-carbon"
							>
								Edit
							</button>
							{localQuantity > 0 && (
								<button
									type="button"
									onClick={handleMarkEmpty}
									disabled={isMarkingEmpty || isDeleting}
									className="px-3 py-1.5 text-sm rounded-lg border border-warning/40 text-warning hover:bg-warning/5 disabled:opacity-60"
								>
									{isMarkingEmpty ? "Clearing..." : "Mark Empty"}
								</button>
							)}
							<button
								type="button"
								onClick={handleDelete}
								disabled={isDeleting}
								className="px-3 py-1.5 text-sm rounded-lg border border-danger/40 text-danger hover:bg-danger/5 disabled:opacity-60"
							>
								{isDeleting ? "Deleting..." : "Delete"}
							</button>
						</div>
					</div>
				</div>
			</div>

			{nutritionEngine && (
				<NutritionPanel
					mode="cargo"
					nutrition={item.nutrition ?? null}
					onRefresh={handleRefreshNutrition}
					refreshing={isRefreshingNutrition}
					refreshMessage={refreshMessage}
				/>
			)}

			<button
				type="button"
				onClick={handleToggleRestock}
				disabled={restockFetcher.state !== "idle"}
				className={`w-full flex items-center justify-center gap-2 font-semibold px-6 py-3 rounded-xl transition-all ${
					localRestockSelected
						? "bg-hyper-green/10 text-hyper-green border border-hyper-green"
						: "bg-platinum text-carbon border border-platinum hover:border-hyper-green/50"
				} ${restockFetcher.state !== "idle" ? "opacity-75 cursor-wait" : ""}`}
			>
				{localRestockSelected ? (
					<>
						<CheckIcon className="w-4 h-4" />
						Remove from Supply restock
					</>
				) : (
					<>
						<PlusIcon className="w-4 h-4" />
						Add to Supply restock
					</>
				)}
			</button>

			<section className="space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="text-label text-muted flex items-center gap-2">
						<span className="w-2 h-2 rounded-full bg-hyper-green" />
						Connected Meals
					</h2>
					<span className="text-xs text-muted">
						{connectedMeals.length}{" "}
						{connectedMeals.length === 1 ? "meal" : "meals"}
					</span>
				</div>

				{connectedMeals.length === 0 ? (
					<div className="glass-panel rounded-xl p-6 border border-platinum/70 text-muted">
						This ingredient is not used in any meals yet.
					</div>
				) : (
					<div className="space-y-3">
						{connectedMeals.map((connectedMeal) => (
							<div
								key={connectedMeal.id}
								className="glass-panel rounded-xl p-4 border border-platinum/70"
							>
								<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
									<div className="space-y-2">
										<Link
											to={`/hub/galley/${connectedMeal.id}`}
											className="text-carbon hover:text-hyper-green font-semibold text-lg"
										>
											{connectedMeal.name}
										</Link>
										{connectedMeal.description && (
											<p className="text-sm text-muted max-w-2xl">
												{connectedMeal.description}
											</p>
										)}
										<div className="flex flex-wrap gap-2">
											{connectedMeal.tags.map((tag) => (
												<TagChip key={tag.id} tag={tag} size="sm" />
											))}
										</div>
									</div>

									<div className="min-w-0 sm:min-w-[220px] space-y-2">
										{connectedMeal.connectedIngredients.map((connection) => (
											<div
												key={connection.id}
												className="rounded-lg border border-platinum p-2 text-sm"
											>
												<div className="flex items-center justify-between gap-2">
													<span className="text-carbon font-medium">
														<DisplayQuantity
															quantity={connection.quantity}
															unit={connection.unit}
															ingredientName={connection.ingredientName}
														/>
													</span>
													<span className="text-xs text-muted">
														{getConnectionLabel(connection.connectionType)}
													</span>
												</div>
												<div className="text-xs text-muted mt-1 truncate">
													{connection.ingredientName}
												</div>
											</div>
										))}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</section>

			{isEditing && (
				<CargoEditModal
					item={item}
					tagSlugs={tags.map((t) => t.slug)}
					tagSuggestions={tagSuggestions}
					onClose={() => setIsEditing(false)}
					fetcher={fetcher}
					isUpdating={isUpdating}
				/>
			)}
			{showRestockModal && (
				<RestockQuantityModal
					itemName={item.name}
					quantity={1}
					unit={toSupportedUnit(item.unit ?? "unit")}
					onConfirm={handleRestockConfirm}
					onCancel={() => setShowRestockModal(false)}
					isPending={restockFetcher.state !== "idle"}
				/>
			)}
			{showQuickEat && cargoQuickEat && (
				<CargoQuickEatDialog
					cargoId={item.id}
					name={item.name}
					quantity={localQuantity}
					unit={item.unit}
					nutrition={item.nutrition as NutritionSnapshot | null}
					notesEnabled={nutritionIntakeNotes}
					onClose={() => setShowQuickEat(false)}
					onSuccess={() => eatToast.show()}
				/>
			)}
			{eatToast.isOpen && (
				<Toast
					variant="success"
					position="bottom-right"
					title="Logged snack"
					description="Added to today's Manifest"
					onDismiss={eatToast.hide}
				/>
			)}
		</div>
	);
}
