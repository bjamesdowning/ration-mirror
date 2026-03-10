import { useEffect, useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";
import { CargoEditModal } from "~/components/cargo/CargoEditModal";
import { StatusGauge } from "~/components/cargo/StatusGauge";
import type { cargo } from "~/db/schema";
import { useConfirm } from "~/lib/confirm-context";
import { formatQuantity } from "~/lib/format-quantity";

type CargoItem = typeof cargo.$inferSelect;

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
	tags: string[];
	connectedIngredients: ConnectedIngredient[];
};

interface CargoDetailProps {
	item: CargoItem;
	connectedMeals: ConnectedMeal[];
}

function parseTags(tags: unknown): string[] {
	if (Array.isArray(tags)) return tags;
	if (typeof tags !== "string") return [];
	try {
		const parsed = JSON.parse(tags);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
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

export function CargoDetail({ item, connectedMeals }: CargoDetailProps) {
	const fetcher = useFetcher<{ success?: boolean; error?: string }>();
	const [isEditing, setIsEditing] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const { confirm } = useConfirm();
	const tags = useMemo(() => parseTags(item.tags), [item.tags]);
	const currentIntent = fetcher.formData?.get("intent") as string | null;
	const isUpdating = fetcher.state !== "idle" && currentIntent === "update";

	useEffect(() => {
		if (fetcher.state === "idle") {
			setIsDeleting(false);
		}
	}, [fetcher.state]);

	useEffect(() => {
		if (isEditing && fetcher.state === "idle" && fetcher.data?.success) {
			setIsEditing(false);
		}
	}, [isEditing, fetcher.state, fetcher.data?.success]);

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

	return (
		<div className="max-w-5xl mx-auto space-y-8">
			<div className="text-sm">
				<Link to="/hub/cargo" className="text-muted hover:text-hyper-green">
					Back to Cargo
				</Link>
			</div>

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
								<span
									key={tag}
									className="text-xs px-2 py-1 bg-hyper-green/10 text-hyper-green rounded-md"
								>
									{tag}
								</span>
							))}
						</div>
					</div>

					<div className="flex flex-col items-start md:items-end gap-3">
						<div className="text-right">
							<div className="text-label text-muted text-xs">Available</div>
							<div className="text-data text-2xl font-bold text-carbon">
								{formatQuantity(item.quantity, item.unit)}
							</div>
						</div>
						<div className="w-full max-w-xs">
							<StatusGauge status={item.status} expiresAt={item.expiresAt} />
						</div>
						<div className="text-xs text-muted">
							Expiry: {formatExpiryDate(item.expiresAt)}
						</div>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => setIsEditing(true)}
								className="px-3 py-1.5 text-sm rounded-lg border border-platinum text-muted hover:text-carbon"
							>
								Edit
							</button>
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
												<span
													key={tag}
													className="text-xs px-2 py-0.5 bg-platinum rounded-md text-muted"
												>
													{tag}
												</span>
											))}
										</div>
									</div>

									<div className="min-w-[220px] space-y-2">
										{connectedMeal.connectedIngredients.map((connection) => (
											<div
												key={connection.id}
												className="rounded-lg border border-platinum p-2 text-sm"
											>
												<div className="flex items-center justify-between gap-2">
													<span className="text-carbon font-medium">
														{formatQuantity(
															connection.quantity,
															connection.unit,
														)}
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
					tags={tags}
					onClose={() => setIsEditing(false)}
					fetcher={fetcher}
					isUpdating={isUpdating}
				/>
			)}
		</div>
	);
}
