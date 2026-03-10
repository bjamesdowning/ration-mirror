import { Link, redirect } from "react-router";
import { CargoDetail } from "~/components/cargo/CargoDetail";
import { HubHeader } from "~/components/hub/HubHeader";
import { DetailNavRocker } from "~/components/shell/DetailNavRocker";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	CargoItemSchema,
	getAdjacentCargoIds,
	getCargoItem,
	jettisonItem,
	updateItem,
} from "~/lib/cargo.server";
import { ITEM_DOMAINS } from "~/lib/domain";
import { handleApiError } from "~/lib/error-handler";
import { getMealsForCargo } from "~/lib/meals.server";
import type { Route } from "./+types/cargo.$id";

export async function loader({ request, params, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const { id } = params;
	if (!id) throw redirect("/hub/cargo");

	const url = new URL(request.url);
	const tag = url.searchParams.get("tag")?.trim().slice(0, 100) ?? undefined;
	const domainParam = url.searchParams.get("domain");
	const domain =
		domainParam &&
		ITEM_DOMAINS.includes(domainParam as (typeof ITEM_DOMAINS)[number])
			? domainParam
			: undefined;

	const item = await getCargoItem(context.cloudflare.env.DB, groupId, id);
	if (!item) throw redirect("/hub/cargo");

	const [connectedMeals, adjacent] = await Promise.all([
		getMealsForCargo(context.cloudflare.env.DB, groupId, id, item.name),
		getAdjacentCargoIds(
			context.cloudflare.env.DB,
			groupId,
			{ id: item.id, createdAt: item.createdAt },
			{ domain },
		),
	]);

	return {
		item,
		connectedMeals,
		prevId: adjacent.prevId,
		nextId: adjacent.nextId,
		navTag: tag,
		navDomain: domain,
	};
}

export async function action({ request, params, context }: Route.ActionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const { id } = params;
	if (!id) throw redirect("/hub/cargo");

	try {
		if (request.method === "DELETE") {
			await jettisonItem(context.cloudflare.env, groupId, id);
			throw redirect("/hub/cargo");
		}

		if (request.method === "PUT" || request.method === "POST") {
			const formData = await request.formData();
			const intent = formData.get("intent");
			if (request.method === "POST" && intent === "delete") {
				await jettisonItem(context.cloudflare.env, groupId, id);
				throw redirect("/hub/cargo");
			}
			if (request.method === "POST" && intent !== "update") {
				return { success: false, error: "Invalid intent" };
			}
			const tagsValue = formData.get("tags") as string;
			const rawTags = tagsValue
				? tagsValue
						.split(",")
						.map((t) => t.trim())
						.filter((t) => t.length > 0)
				: [];
			const expiresAtValue = formData.get("expiresAt");
			const payload = {
				name: formData.get("name"),
				quantity: formData.get("quantity"),
				unit: formData.get("unit"),
				domain: formData.get("domain") ?? undefined,
				tags: rawTags,
				expiresAt: expiresAtValue || undefined,
			};

			const parsed = CargoItemSchema.safeParse(payload);
			if (!parsed.success) {
				return { success: false, errors: parsed.error.flatten() };
			}

			const updated = await updateItem(
				context.cloudflare.env,
				groupId,
				id,
				parsed.data,
			);
			if (!updated) {
				return { success: false, error: "Item not found or unauthorized" };
			}
			return { success: true };
		}

		return null;
	} catch (e) {
		return handleApiError(e);
	}
}

export function HydrateFallback() {
	return (
		<>
			<HubHeader title="INGREDIENT DETAILS" subtitle="Loading..." />
			<div className="max-w-5xl mx-auto space-y-8 animate-pulse">
				<div className="text-sm">
					<div className="h-4 w-24 bg-platinum rounded" />
				</div>
				<div className="glass-panel rounded-xl p-6 border border-platinum/70">
					<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
						<div className="space-y-3">
							<div className="h-3 w-24 bg-platinum rounded" />
							<div className="h-8 w-56 bg-platinum rounded" />
							<div className="flex gap-2">
								<div className="h-6 w-16 bg-platinum rounded-full" />
							</div>
						</div>
						<div className="flex flex-col items-end gap-3">
							<div className="h-8 w-24 bg-platinum rounded" />
							<div className="h-4 w-32 bg-platinum rounded" />
							<div className="flex gap-2">
								<div className="h-8 w-16 bg-platinum rounded-lg" />
								<div className="h-8 w-16 bg-platinum rounded-lg" />
							</div>
						</div>
					</div>
				</div>
				<div className="space-y-4">
					<div className="h-4 w-36 bg-platinum rounded" />
					{[1, 2].map((i) => (
						<div
							key={i}
							className="glass-panel rounded-xl p-4 border border-platinum/70"
						>
							<div className="h-6 w-48 bg-platinum rounded mb-2" />
							<div className="h-4 w-full max-w-sm bg-platinum rounded" />
						</div>
					))}
				</div>
			</div>
		</>
	);
}

export default function CargoDetailRoute({ loaderData }: Route.ComponentProps) {
	const { item, connectedMeals, prevId, nextId, navTag, navDomain } =
		loaderData;

	return (
		<>
			<HubHeader
				title="INGREDIENT DETAILS"
				subtitle={`ID: ${item.id.slice(0, 8)}`}
			/>
			<div className="flex items-center justify-between mb-6">
				<Link
					to="/hub/cargo"
					className="text-sm text-muted hover:text-hyper-green transition-colors"
				>
					← Back to Cargo
				</Link>
				<DetailNavRocker
					prevId={prevId}
					nextId={nextId}
					basePath="/hub/cargo"
					tag={navTag}
					domain={navDomain}
					itemLabel="ingredient"
				/>
			</div>
			<CargoDetail item={item} connectedMeals={connectedMeals} />
		</>
	);
}
