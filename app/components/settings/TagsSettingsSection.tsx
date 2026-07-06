import { useMemo, useState } from "react";
import { useRevalidator } from "react-router";
import { TagChip } from "~/components/shared/TagChip";
import { Toast } from "~/components/shell/Toast";
import { useToast } from "~/hooks/useToast";
import { useConfirm } from "~/lib/confirm-context";
import { formatTagName, type TagWithCounts } from "~/lib/tags";

const TAG_COLORS = [
	"#00E088",
	"#3B82F6",
	"#F59E0B",
	"#EF4444",
	"#8B5CF6",
	"#EC4899",
	"#14B8A6",
	"#64748B",
] as const;

interface TagsSettingsSectionProps {
	tags: TagWithCounts[];
	unusedTags: TagWithCounts[];
	canManage: boolean;
}

export function TagsSettingsSection({
	tags,
	unusedTags,
	canManage,
}: TagsSettingsSectionProps) {
	const revalidator = useRevalidator();
	const { confirm } = useConfirm();
	const successToast = useToast({ duration: 3000 });
	const errorToast = useToast({ duration: 4000 });
	const [errorMessage, setErrorMessage] = useState("");
	const [busyId, setBusyId] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editCategory, setEditCategory] = useState("");
	const [editColor, setEditColor] = useState<string | null>(null);
	const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
	const [mergeTargetId, setMergeTargetId] = useState("");
	const [isCleaningUnused, setIsCleaningUnused] = useState(false);

	const sortedTags = useMemo(
		() => [...tags].sort((a, b) => a.name.localeCompare(b.name)),
		[tags],
	);

	const mergeTargets = useMemo(
		() => sortedTags.filter((t) => t.id !== mergeSourceId),
		[sortedTags, mergeSourceId],
	);

	const startEdit = (tag: TagWithCounts) => {
		setEditingId(tag.id);
		setEditName(tag.name);
		setEditCategory(tag.category ?? "");
		setEditColor(tag.color ?? null);
		setMergeSourceId(null);
	};

	const cancelEdit = () => {
		setEditingId(null);
		setMergeSourceId(null);
		setMergeTargetId("");
	};

	const patchTag = async (
		tagId: string,
		body: Record<string, string | null | undefined>,
	) => {
		setBusyId(tagId);
		setErrorMessage("");
		try {
			const response = await fetch(`/api/tags/${tagId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const payload = (await response.json()) as { error?: string };
			if (!response.ok) {
				throw new Error(payload.error ?? "Failed to update tag");
			}
			successToast.show();
			cancelEdit();
			revalidator.revalidate();
		} catch (e) {
			setErrorMessage(e instanceof Error ? e.message : "Failed to update tag");
			errorToast.show();
		} finally {
			setBusyId(null);
		}
	};

	const deleteTag = async (tag: TagWithCounts) => {
		const confirmed = await confirm({
			title: "Delete tag?",
			message: `"${tag.name}" will be removed from the registry. Items keep their other tags.`,
			confirmLabel: "Delete",
			variant: "danger",
		});
		if (!confirmed) return;

		setBusyId(tag.id);
		setErrorMessage("");
		try {
			const response = await fetch(`/api/tags/${tag.id}`, {
				method: "DELETE",
			});
			const payload = (await response.json()) as { error?: string };
			if (!response.ok) {
				throw new Error(payload.error ?? "Failed to delete tag");
			}
			successToast.show();
			cancelEdit();
			revalidator.revalidate();
		} catch (e) {
			setErrorMessage(e instanceof Error ? e.message : "Failed to delete tag");
			errorToast.show();
		} finally {
			setBusyId(null);
		}
	};

	const mergeTag = async () => {
		if (!mergeSourceId || !mergeTargetId) return;
		const source = tags.find((t) => t.id === mergeSourceId);
		const target = tags.find((t) => t.id === mergeTargetId);
		if (!source || !target) return;

		const confirmed = await confirm({
			title: "Merge tags?",
			message: `All uses of "${source.name}" will move to "${target.name}". The source tag will be deleted.`,
			confirmLabel: "Merge",
			variant: "warning",
		});
		if (!confirmed) return;

		setBusyId(mergeSourceId);
		setErrorMessage("");
		try {
			const response = await fetch(`/api/tags/${mergeSourceId}/merge`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ targetId: mergeTargetId }),
			});
			const payload = (await response.json()) as { error?: string };
			if (!response.ok) {
				throw new Error(payload.error ?? "Failed to merge tags");
			}
			successToast.show();
			cancelEdit();
			revalidator.revalidate();
		} catch (e) {
			setErrorMessage(e instanceof Error ? e.message : "Failed to merge tags");
			errorToast.show();
		} finally {
			setBusyId(null);
		}
	};

	const cleanupUnused = async () => {
		if (unusedTags.length === 0) return;
		const confirmed = await confirm({
			title: "Remove unused tags?",
			message: `${unusedTags.length} tag${unusedTags.length === 1 ? "" : "s"} with no cargo or meal links will be deleted.`,
			confirmLabel: "Clean up",
			variant: "warning",
		});
		if (!confirmed) return;

		setIsCleaningUnused(true);
		setErrorMessage("");
		try {
			for (const tag of unusedTags) {
				const response = await fetch(`/api/tags/${tag.id}`, {
					method: "DELETE",
				});
				if (!response.ok) {
					const payload = (await response.json()) as { error?: string };
					throw new Error(payload.error ?? `Failed to delete ${tag.name}`);
				}
			}
			successToast.show();
			revalidator.revalidate();
		} catch (e) {
			setErrorMessage(
				e instanceof Error ? e.message : "Failed to clean up unused tags",
			);
			errorToast.show();
		} finally {
			setIsCleaningUnused(false);
		}
	};

	return (
		<div className="glass-panel rounded-xl p-6">
			<div className="flex flex-wrap items-start justify-between gap-4 mb-4">
				<div>
					<h3 className="text-xs text-label text-muted mb-1">Tags</h3>
					<p className="text-sm text-muted max-w-lg">
						Organization-wide labels for Cargo and Galley. Up to 10 tags per
						item. Manage names, colors, and categories here.
					</p>
				</div>
				{canManage && unusedTags.length > 0 && (
					<button
						type="button"
						onClick={cleanupUnused}
						disabled={isCleaningUnused}
						className="text-xs px-3 py-1.5 rounded-lg bg-platinum/60 text-muted hover:text-carbon hover:bg-platinum disabled:opacity-50"
					>
						{isCleaningUnused
							? "Cleaning…"
							: `Remove ${unusedTags.length} unused`}
					</button>
				)}
			</div>

			{sortedTags.length === 0 ? (
				<p className="text-sm text-muted">
					No tags yet. Tags are created when you label cargo or meals.
				</p>
			) : (
				<ul className="space-y-3">
					{sortedTags.map((tag) => {
						const isEditing = editingId === tag.id;
						const isMerging = mergeSourceId === tag.id;
						const isBusy = busyId === tag.id;

						return (
							<li
								key={tag.id}
								className="p-3 bg-platinum/30 rounded-lg space-y-3"
							>
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div className="flex items-center gap-3 min-w-0">
										<TagChip tag={tag} size="sm" />
										<div className="min-w-0">
											<p className="text-sm font-medium text-carbon truncate">
												{tag.name}
											</p>
											<p className="text-xs text-muted font-mono truncate">
												{tag.slug}
												{tag.category ? ` · ${tag.category}` : ""}
											</p>
										</div>
									</div>
									<div className="text-xs text-muted whitespace-nowrap">
										{tag.cargoCount} cargo · {tag.mealCount} meals
									</div>
								</div>

								{canManage && !isEditing && !isMerging && (
									<div className="flex flex-wrap gap-2">
										<button
											type="button"
											onClick={() => startEdit(tag)}
											className="text-xs px-2 py-1 rounded bg-hyper-green/10 text-hyper-green hover:bg-hyper-green/20"
										>
											Edit
										</button>
										<button
											type="button"
											onClick={() => {
												setMergeSourceId(tag.id);
												setMergeTargetId("");
												setEditingId(null);
											}}
											className="text-xs px-2 py-1 rounded bg-platinum/60 text-muted hover:text-carbon"
										>
											Merge
										</button>
										<button
											type="button"
											onClick={() => deleteTag(tag)}
											disabled={isBusy}
											className="text-xs px-2 py-1 rounded bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-50"
										>
											Delete
										</button>
									</div>
								)}

								{canManage && isEditing && (
									<div className="space-y-3 pt-1 border-t border-platinum/50">
										<label className="block">
											<span className="text-xs text-muted">Display name</span>
											<input
												type="text"
												value={editName}
												onChange={(e) => setEditName(e.target.value)}
												maxLength={100}
												className="mt-1 w-full px-3 py-2 text-sm rounded-lg bg-white/80 border border-platinum"
											/>
										</label>
										<label className="block">
											<span className="text-xs text-muted">
												Category (optional)
											</span>
											<input
												type="text"
												value={editCategory}
												onChange={(e) => setEditCategory(e.target.value)}
												placeholder="e.g. Diet, Storage"
												maxLength={50}
												className="mt-1 w-full px-3 py-2 text-sm rounded-lg bg-white/80 border border-platinum"
											/>
										</label>
										<div>
											<span className="text-xs text-muted">Color</span>
											<div className="mt-2 flex flex-wrap gap-2">
												<button
													type="button"
													onClick={() => setEditColor(null)}
													className={[
														"w-7 h-7 rounded-full border-2 bg-hyper-green/10",
														editColor === null
															? "border-hyper-green"
															: "border-transparent",
													].join(" ")}
													title="Default"
													aria-label="Default color"
												/>
												{TAG_COLORS.map((color) => (
													<button
														key={color}
														type="button"
														onClick={() => setEditColor(color)}
														className={[
															"w-7 h-7 rounded-full border-2",
															editColor === color
																? "border-carbon"
																: "border-transparent",
														].join(" ")}
														style={{ backgroundColor: color }}
														title={color}
														aria-label={`Color ${color}`}
													/>
												))}
											</div>
										</div>
										<div className="flex flex-wrap gap-2">
											<button
												type="button"
												disabled={isBusy || !editName.trim()}
												onClick={() =>
													patchTag(tag.id, {
														name: editName.trim(),
														category: editCategory.trim() || null,
														color: editColor,
													})
												}
												className="text-xs px-3 py-1.5 rounded bg-hyper-green text-carbon font-semibold disabled:opacity-50"
											>
												{isBusy ? "Saving…" : "Save"}
											</button>
											<button
												type="button"
												onClick={cancelEdit}
												className="text-xs px-3 py-1.5 rounded bg-platinum/60 text-muted"
											>
												Cancel
											</button>
										</div>
									</div>
								)}

								{canManage && isMerging && (
									<div className="space-y-3 pt-1 border-t border-platinum/50">
										<p className="text-xs text-muted">
											Merge <strong>{tag.name}</strong> into:
										</p>
										<select
											value={mergeTargetId}
											onChange={(e) => setMergeTargetId(e.target.value)}
											className="w-full px-3 py-2 text-sm rounded-lg bg-white/80 border border-platinum"
										>
											<option value="">Select target tag…</option>
											{mergeTargets.map((t) => (
												<option key={t.id} value={t.id}>
													{t.name} ({formatTagName(t.slug)})
												</option>
											))}
										</select>
										<div className="flex flex-wrap gap-2">
											<button
												type="button"
												disabled={isBusy || !mergeTargetId}
												onClick={mergeTag}
												className="text-xs px-3 py-1.5 rounded bg-hyper-green text-carbon font-semibold disabled:opacity-50"
											>
												{isBusy ? "Merging…" : "Confirm merge"}
											</button>
											<button
												type="button"
												onClick={cancelEdit}
												className="text-xs px-3 py-1.5 rounded bg-platinum/60 text-muted"
											>
												Cancel
											</button>
										</div>
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}

			{successToast.isOpen && (
				<Toast
					variant="success"
					title="Tags updated"
					description="Your tag registry changes were saved."
					onDismiss={successToast.hide}
				/>
			)}
			{errorToast.isOpen && (
				<Toast
					variant="error"
					title="Tag update failed"
					description={errorMessage}
					onDismiss={errorToast.hide}
				/>
			)}
		</div>
	);
}
