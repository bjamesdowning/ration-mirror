import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { useEffect, useRef, useState } from "react";
import {
	data,
	Form,
	Link,
	redirect,
	useFetcher,
	useNavigate,
	useNavigation,
} from "react-router";
import { CreditShop } from "~/components/hub/CreditShop";
import { SettingsIcon } from "~/components/icons/PageIcons";
import { PageHeader } from "~/components/shell/PageHeader";
import * as schema from "~/db/schema";
import { API_RATE_LIMITS, V1_ENDPOINTS } from "~/lib/api-docs";
import { requireActiveGroup } from "~/lib/auth.server";
import { authClient } from "~/lib/auth-client";
import { useConfirm } from "~/lib/confirm-context";
import { toExpiryDate } from "~/lib/date-utils";
import { log } from "~/lib/logging.server";
import { HubLayoutSchema } from "~/lib/schemas/hub";
import type { UserSettings } from "~/lib/types";
import type { Route } from "./+types/settings";

export async function loader(args: Route.LoaderArgs) {
	try {
		const {
			session: { user: authUser },
			groupId,
		} = await requireActiveGroup(args.context, args.request);
		const userId = authUser.id;

		const env = args.context.cloudflare.env;
		const db = drizzle(env.DB, { schema });

		const user = await db.query.user.findFirst({
			where: (user, { eq }) => eq(user.id, userId),
			with: { sessions: true },
		});

		if (!user) throw redirect("/");

		// Drizzle automatically parses JSON mode fields
		const settings = (user.settings as UserSettings) || {};

		// Fetch members
		const members = await db.query.member.findMany({
			where: (member, { eq }) => eq(member.organizationId, groupId),
			with: {
				user: true,
				organization: true, // Fetch organization name
			},
		});

		// Check if current user is owner
		const currentMember = members.find((m) => m.userId === userId);
		const isOwner = currentMember?.role === "owner";
		const currentOrg = members[0]?.organization;

		// Fetch all organizations the user is a member of (for default group selector)
		const userOrganizations = await db.query.member.findMany({
			where: (member, { eq }) => eq(member.userId, userId),
			with: {
				organization: true,
			},
		});

		// Fetch credits for the current group
		const { checkBalance } = await import("../../lib/ledger.server");

		// Transaction status from checkout return redirect (processed in checkout.return route)
		const url = new URL(args.request.url);
		const transactionParam = url.searchParams.get("transaction");
		const transactionStatus: "success" | "pending" | "failed" | null =
			transactionParam === "success"
				? "success"
				: transactionParam === "failed"
					? "failed"
					: null;

		const credits = await checkBalance(env, groupId);

		// API keys for current organization
		const apiKeys = await db.query.apiKey.findMany({
			where: (key, { eq }) => eq(key.organizationId, groupId),
			columns: {
				id: true,
				keyPrefix: true,
				name: true,
				scopes: true,
				lastUsedAt: true,
				createdAt: true,
			},
		});

		return {
			settings,
			members,
			isOwner,
			organizationId: groupId,
			organizationName: currentOrg?.name || "Unknown Group",
			userOrganizations: userOrganizations.map((m) => m.organization),
			credits,
			stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY,
			transactionStatus,
			isAdmin: user.isAdmin ?? false,
			tier: user.tier ?? "free",
			tierExpiresAt: user.tierExpiresAt ?? null,
			welcomeVoucherRedeemed: user.welcomeVoucherRedeemed ?? false,
			apiKeys,
			origin: url.origin,
		};
	} catch (error) {
		log.error("[Settings] Loader failed", error);
		if (error instanceof Response) throw error;
		throw data({ error: "Failed to load settings" }, { status: 500 });
	}
}

export async function action(args: Route.ActionArgs) {
	const {
		session: { user: authUser },
	} = await requireActiveGroup(args.context, args.request);
	const userId = authUser.id;

	const formData = await args.request.formData();
	const intent = formData.get("intent");

	const env = args.context.cloudflare.env;
	const db = drizzle(env.DB, { schema });

	if (intent === "update-theme") {
		const theme = formData.get("theme") as "light" | "dark";

		const user = await db.query.user.findFirst({
			where: (user, { eq }) => eq(user.id, userId),
		});

		if (user) {
			const currentSettings = (user.settings as UserSettings) || {};
			const newSettings: UserSettings = {
				...currentSettings,
				theme,
			};

			await db
				.update(schema.user)
				.set({ settings: newSettings })
				.where(eq(schema.user.id, userId));
		}

		return data(
			{ success: true },
			{
				headers: {
					"Set-Cookie": `theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`,
				},
			},
		);
	}

	if (intent === "update-expiration-alert") {
		const days = Number(formData.get("expirationAlertDays")) || 7;
		const clampedDays = Math.min(Math.max(days, 1), 30); // Clamp between 1-30

		const user = await db.query.user.findFirst({
			where: (user, { eq }) => eq(user.id, userId),
		});

		if (user) {
			const currentSettings = (user.settings as UserSettings) || {};
			const newSettings: UserSettings = {
				...currentSettings,
				expirationAlertDays: clampedDays,
			};

			await db
				.update(schema.user)
				.set({ settings: newSettings })
				.where(eq(schema.user.id, userId));
		}

		return { success: true };
	}

	if (intent === "update-default-group") {
		const defaultGroupId = formData.get("defaultGroupId") as string;

		const user = await db.query.user.findFirst({
			where: (user, { eq }) => eq(user.id, userId),
		});

		if (user) {
			const currentSettings = (user.settings as UserSettings) || {};
			const newSettings: UserSettings = {
				...currentSettings,
				defaultGroupId: defaultGroupId || undefined,
			};

			await db
				.update(schema.user)
				.set({ settings: newSettings })
				.where(eq(schema.user.id, userId));
		}
		return { success: true };
	}

	if (intent === "update-hub-profile") {
		const hubProfileRaw = formData.get("hubProfile");
		const validProfiles = [
			"cook",
			"shop",
			"minimal",
			"full",
			"custom",
		] as const;
		const hubProfile =
			typeof hubProfileRaw === "string" &&
			validProfiles.includes(hubProfileRaw as (typeof validProfiles)[number])
				? (hubProfileRaw as UserSettings["hubProfile"])
				: null;

		const user = await db.query.user.findFirst({
			where: (user, { eq }) => eq(user.id, userId),
		});

		if (user && hubProfile) {
			const currentSettings = (user.settings as UserSettings) || {};
			const newSettings: UserSettings = {
				...currentSettings,
				hubProfile,
				...(hubProfile !== "custom" ? { hubLayout: undefined } : {}),
			};

			await db
				.update(schema.user)
				.set({ settings: newSettings })
				.where(eq(schema.user.id, userId));
		}
		return { success: true };
	}

	if (intent === "update-hub-layout") {
		const hubLayoutRaw = formData.get("hubLayout");

		const user = await db.query.user.findFirst({
			where: (user, { eq }) => eq(user.id, userId),
		});

		if (user && typeof hubLayoutRaw === "string") {
			try {
				const parsed = JSON.parse(hubLayoutRaw) as unknown;
				const result = HubLayoutSchema.safeParse(parsed);
				if (result.success) {
					const currentSettings = (user.settings as UserSettings) || {};
					const newSettings: UserSettings = {
						...currentSettings,
						hubProfile: "custom",
						hubLayout: result.data,
					};

					await db
						.update(schema.user)
						.set({ settings: newSettings })
						.where(eq(schema.user.id, userId));
				}
			} catch {
				// Invalid JSON or schema - ignore
			}
		}
		return { success: true };
	}

	return null;
}

export default function Settings({ loaderData }: Route.ComponentProps) {
	const { settings, members, isOwner, organizationId, userOrganizations } =
		loaderData;
	const { confirm } = useConfirm();
	const billingPortalFetcher = useFetcher<{ url?: string; error?: string }>();
	const purgeFetcher = useFetcher();
	const deleteGroupFetcher = useFetcher();
	const navigation = useNavigation();
	const isPurging = purgeFetcher.state !== "idle";
	const isDeletingGroup = deleteGroupFetcher.state !== "idle";
	const isUpdatingTheme =
		navigation.state === "submitting" &&
		navigation.formData?.get("intent") === "update-theme";
	const isUpdatingExpiration =
		navigation.state === "submitting" &&
		navigation.formData?.get("intent") === "update-expiration-alert";

	const isUpdatingDefaultGroup =
		navigation.state === "submitting" &&
		navigation.formData?.get("intent") === "update-default-group";

	useEffect(() => {
		if (billingPortalFetcher.data?.url) {
			window.location.href = billingPortalFetcher.data.url;
		}
	}, [billingPortalFetcher.data]);

	return (
		<div className="space-y-6">
			<PageHeader
				icon={<SettingsIcon className="w-6 h-6 text-hyper-green" />}
				title="System"
			/>
			<p className="text-sm text-muted">Preferences & Configuration</p>

			<div className="space-y-6">
				<section className="glass-panel rounded-xl p-6">
					<h2 className="text-xl font-bold mb-2 text-carbon">Your Plan</h2>
					<p className="text-sm text-muted mb-4">
						Current tier:{" "}
						<span className="font-semibold text-carbon">
							{loaderData.tier === "crew_member" ? "Crew Member" : "Free"}
						</span>
					</p>
					{loaderData.tier === "crew_member" && (
						<p className="text-xs text-muted mb-4">
							Renews on{" "}
							{loaderData.tierExpiresAt
								? (toExpiryDate(
										loaderData.tierExpiresAt,
									)?.toLocaleDateString() ?? "unknown")
								: "unknown"}
						</p>
					)}
					<div className="flex flex-wrap gap-3">
						<Link
							to="/hub/pricing"
							className="px-4 py-2 bg-hyper-green text-carbon rounded-lg font-semibold"
						>
							View Pricing
						</Link>
						{loaderData.tier === "crew_member" && (
							<button
								type="button"
								onClick={() =>
									billingPortalFetcher.submit(null, {
										method: "post",
										action: "/api/billing-portal",
									})
								}
								className="px-4 py-2 bg-platinum text-carbon rounded-lg font-medium"
							>
								Manage Subscription
							</button>
						)}
					</div>
				</section>

				{/* User Profile & Credits */}
				<ReferenceIdSection credits={loaderData.credits} />

				{/* API Keys */}
				<ApiKeysSection
					apiKeys={loaderData.apiKeys ?? []}
					organizationName={loaderData.organizationName}
					origin={loaderData.origin ?? ""}
				/>

				{/* Administration (admin only) */}
				{loaderData.isAdmin && (
					<section className="glass-panel rounded-xl p-6">
						<h2 className="text-xl font-bold mb-2 text-carbon">
							Administration
						</h2>
						<p className="text-sm text-muted mb-4">
							System-wide management and metrics
						</p>
						<Link
							to="/admin"
							className="inline-flex items-center gap-2 px-4 py-2 bg-hyper-green/10 text-hyper-green rounded-lg font-medium hover:bg-hyper-green/20 transition-colors"
						>
							Admin Dashboard
						</Link>
					</section>
				)}

				{/* Purchase Credits */}
				<section className="glass-panel rounded-xl p-6">
					<h2 className="text-xl font-bold mb-4 text-carbon">
						Acquire Credits
					</h2>

					{/* Transaction Status Messages */}
					{loaderData.transactionStatus === "success" && (
						<div className="mb-6 p-4 bg-success/10 border border-success/20 rounded-lg flex items-center gap-4">
							<div className="text-2xl text-success">✓</div>
							<div>
								<div className="font-bold text-carbon">
									Transaction Complete
								</div>
								<div className="text-sm text-muted">
									Credits have been added to your account.
								</div>
							</div>
						</div>
					)}

					{loaderData.transactionStatus === "failed" && (
						<div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-lg flex items-center gap-4">
							<div className="text-2xl text-danger">!</div>
							<div>
								<div className="font-bold text-danger">Verification Failed</div>
								<div className="text-sm text-muted">
									Could not verify transaction. Please contact support.
								</div>
							</div>
						</div>
					)}

					{loaderData.stripePublishableKey && (
						<CreditShop
							stripePublishableKey={loaderData.stripePublishableKey}
							returnUrl="/hub/checkout/return"
						/>
					)}
				</section>

				{/* Group Management */}
				<GroupManagement members={members} />

				{/* Hub Layout */}
				<section className="glass-panel rounded-xl p-6">
					<h2 className="text-xl font-bold mb-2 text-carbon">Hub Layout</h2>
					<p className="text-sm text-muted mb-4">
						Customize which widgets appear on your Hub and how they're arranged.
					</p>
					<Link
						to="/hub?edit=1"
						className="inline-flex items-center gap-2 px-4 py-2 bg-hyper-green/10 text-hyper-green rounded-lg font-medium hover:bg-hyper-green/20 transition-colors"
					>
						<svg
							className="w-4 h-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
							/>
						</svg>
						Customize Hub
					</Link>
				</section>

				{/* Default Group */}
				<section className="glass-panel rounded-xl p-6">
					<h2 className="text-xl font-bold mb-2 text-carbon">Default Group</h2>
					<p className="text-sm text-muted mb-4">
						Select which group to activate when you sign in
					</p>
					<Form method="post" className="flex items-center gap-4">
						<input type="hidden" name="intent" value="update-default-group" />
						<select
							name="defaultGroupId"
							defaultValue={settings.defaultGroupId || ""}
							onChange={(e) => e.target.form?.requestSubmit()}
							className="flex-1 px-4 py-2 bg-platinum/50 border border-carbon/10 rounded-lg text-carbon focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
						>
							<option value="">Auto-select (Personal Group)</option>
							{userOrganizations?.map((org) => (
								<option key={org.id} value={org.id}>
									{org.name}
								</option>
							))}
						</select>
						{isUpdatingDefaultGroup && (
							<span className="text-hyper-green animate-pulse text-sm">
								Saving...
							</span>
						)}
					</Form>
				</section>

				{/* Appearance */}
				<section className="glass-panel rounded-xl p-6">
					<h2 className="text-xl font-bold mb-2 text-carbon">Appearance</h2>
					<p className="text-sm text-muted mb-4">
						Choose your preferred color scheme
					</p>
					<Form method="post" className="flex gap-4 flex-wrap">
						<input type="hidden" name="intent" value="update-theme" />

						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="theme"
								value="light"
								defaultChecked={settings.theme !== "dark"}
								className="w-4 h-4 accent-hyper-green"
								onChange={(e) => {
									// Immediately apply theme for instant feedback
									document.documentElement.classList.remove("dark");
									e.target.form?.requestSubmit();
								}}
							/>
							<span className="text-carbon">Light</span>
						</label>

						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="theme"
								value="dark"
								defaultChecked={settings.theme === "dark"}
								className="w-4 h-4 accent-hyper-green"
								onChange={(e) => {
									// Immediately apply theme for instant feedback
									document.documentElement.classList.add("dark");
									e.target.form?.requestSubmit();
								}}
							/>
							<span className="text-carbon">Dark</span>
						</label>

						{isUpdatingTheme && (
							<span className="text-hyper-green animate-pulse text-sm ml-4 my-auto">
								Saving...
							</span>
						)}
					</Form>
				</section>

				{/* Expiration Alert */}
				<section className="glass-panel rounded-xl p-6">
					<h2 className="text-xl font-bold mb-2 text-carbon">
						Expiration Alerts
					</h2>
					<p className="text-sm text-muted mb-4">
						Get alerts for items expiring within this many days
					</p>
					<Form method="post" className="flex items-center gap-4">
						<input
							type="hidden"
							name="intent"
							value="update-expiration-alert"
						/>
						<input
							type="range"
							name="expirationAlertDays"
							min="1"
							max="30"
							defaultValue={settings.expirationAlertDays || 7}
							onChange={(e) => {
								const display = e.target.nextElementSibling;
								if (display) display.textContent = `${e.target.value} days`;
							}}
							onMouseUp={(e) => e.currentTarget.form?.requestSubmit()}
							onTouchEnd={(e) => e.currentTarget.form?.requestSubmit()}
							className="flex-1 h-2 bg-platinum rounded-lg appearance-none cursor-pointer accent-hyper-green"
						/>
						<span className="text-carbon font-bold min-w-[60px] text-right">
							{settings.expirationAlertDays || 7} days
						</span>
						{isUpdatingExpiration && (
							<span className="text-hyper-green animate-pulse text-sm">
								Saving...
							</span>
						)}
					</Form>
				</section>

				{/* Danger Zone */}
				<section className="bg-danger/5 border border-danger/20 rounded-xl p-6 relative">
					<div className="absolute top-4 right-4 bg-danger/20 px-2 py-1 text-xs text-danger rounded-md font-semibold">
						Danger Zone
					</div>

					<h2 className="text-xl font-bold mb-2 text-danger">Delete Account</h2>
					<p className="text-sm text-muted mb-6 max-w-md">
						Complete removal of your account and data. This action deletes all
						inventory, ledger history, and user records. This cannot be undone.
					</p>

					<button
						type="button"
						disabled={isPurging}
						onClick={async () => {
							if (
								!(await confirm({
									title: "Are you sure you want to delete your account?",
									message:
										"This cannot be undone. All data will be permanently removed.",
									confirmLabel: "Delete Account",
									variant: "danger",
								}))
							)
								return;
							purgeFetcher.submit(null, {
								method: "post",
								action: "/api/user/purge",
							});
						}}
						className="px-4 py-2 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 transition-colors disabled:opacity-50"
					>
						{isPurging ? "Deleting..." : "Delete Account"}
					</button>

					{isOwner && (
						<div className="mt-8 pt-8 border-t border-danger/20">
							<h2 className="text-xl font-bold mb-2 text-danger">
								Delete Group
							</h2>
							<p className="text-sm text-muted mb-6 max-w-md">
								Permanently delete this group and all its data (inventory,
								meals, lists). This cannot be undone.
							</p>

							<button
								type="button"
								disabled={isDeletingGroup}
								onClick={async () => {
									if (
										!(await confirm({
											title: "Are you sure you want to delete this group?",
											message:
												"All shared data will be lost forever. This cannot be undone.",
											confirmLabel: "Delete Group",
											variant: "danger",
										}))
									)
										return;
									const formData = new FormData();
									formData.set("organizationId", organizationId);
									deleteGroupFetcher.submit(formData, {
										method: "post",
										action: "/api/groups/delete",
									});
								}}
								className="px-4 py-2 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 transition-colors disabled:opacity-50"
							>
								{isDeletingGroup ? "Deleting..." : "Delete Group"}
							</button>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}

type ApiKeyRow = {
	id: string;
	keyPrefix: string;
	name: string;
	scopes: string;
	lastUsedAt: Date | null;
	createdAt: Date;
};

function ApiKeysSection({
	apiKeys,
	organizationName,
	origin,
}: {
	apiKeys: ApiKeyRow[];
	organizationName: string;
	origin: string;
}) {
	const [apiRefExpanded, setApiRefExpanded] = useState(false);
	const apiRefRef = useRef<HTMLDivElement>(null);

	// Expand API Reference when arriving via #api
	useEffect(() => {
		if (typeof window !== "undefined" && window.location.hash === "#api") {
			setApiRefExpanded(true);
			queueMicrotask(() => {
				apiRefRef.current?.scrollIntoView({ behavior: "smooth" });
			});
		}
	}, []);

	const createFetcher = useFetcher<{
		key?: string;
		prefix?: string;
		id?: string;
		name?: string;
		createdAt?: string;
		error?: string;
	}>();
	const [newKeyDisplay, setNewKeyDisplay] = useState<string | null>(null);
	const [createName, setCreateName] = useState("");

	useEffect(() => {
		if (createFetcher.data?.key && createFetcher.state === "idle") {
			setNewKeyDisplay(createFetcher.data.key);
			setCreateName("");
		}
	}, [createFetcher.data?.key, createFetcher.state]);

	const handleCreate = (e: React.FormEvent) => {
		if (!createName.trim()) e.preventDefault();
		else setNewKeyDisplay(null);
	};

	return (
		<section className="glass-panel rounded-xl p-6">
			<h2 className="text-xl font-bold mb-2 text-carbon">API Keys</h2>
			<p className="text-sm text-muted mb-4">
				Create keys to access Inventory, Galley, and Supply import/export via
				REST API. Keys are scoped to{" "}
				<span className="font-medium text-carbon">{organizationName}</span>. Use
				the key in the{" "}
				<code className="text-xs bg-platinum/50 px-1 rounded">
					Authorization: Bearer &lt;key&gt;
				</code>{" "}
				header or{" "}
				<code className="text-xs bg-platinum/50 px-1 rounded">X-Api-Key</code>.
			</p>

			{newKeyDisplay && (
				<div className="mb-6 p-4 bg-hyper-green/10 border border-hyper-green/20 rounded-lg">
					<p className="text-xs text-muted font-bold uppercase mb-2">
						Copy your key now — it won&apos;t be shown again
					</p>
					<div className="flex gap-2">
						<input
							type="text"
							readOnly
							value={newKeyDisplay}
							className="flex-1 bg-white/50 border border-carbon/10 rounded px-3 py-1 text-sm font-mono text-carbon"
							onClick={(e) => e.currentTarget.select()}
						/>
						<button
							type="button"
							onClick={() => {
								navigator.clipboard.writeText(newKeyDisplay);
								alert("Copied to clipboard!");
							}}
							className="px-3 py-1 bg-hyper-green text-carbon text-xs font-semibold rounded hover:bg-hyper-green/90"
						>
							Copy
						</button>
						<button
							type="button"
							onClick={() => setNewKeyDisplay(null)}
							className="px-3 py-1 bg-platinum text-carbon text-xs font-semibold rounded"
						>
							Done
						</button>
					</div>
				</div>
			)}

			<createFetcher.Form
				method="post"
				action="/api/api-keys"
				onSubmit={handleCreate}
				className="flex gap-2 mb-6"
			>
				<input
					type="text"
					name="name"
					value={createName}
					onChange={(e) => setCreateName(e.target.value)}
					placeholder="Key name (e.g. My Script)"
					className="flex-1 max-w-xs px-4 py-2 bg-platinum/50 border border-carbon/10 rounded-lg text-carbon placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
					maxLength={100}
				/>
				<button
					type="submit"
					disabled={createFetcher.state !== "idle" || !createName.trim()}
					className="px-4 py-2 bg-hyper-green text-carbon rounded-lg font-semibold hover:bg-hyper-green/90 disabled:opacity-50"
				>
					{createFetcher.state === "submitting" ? "Creating..." : "Create key"}
				</button>
			</createFetcher.Form>

			{createFetcher.data?.error && (
				<p className="text-sm text-danger mb-4">{createFetcher.data.error}</p>
			)}

			<div className="space-y-3">
				{apiKeys.length === 0 && !newKeyDisplay ? (
					<p className="text-sm text-muted">
						No API keys yet. Create one above.
					</p>
				) : (
					apiKeys.map((k) => <ApiKeyRow key={k.id} keyRecord={k} />)
				)}
			</div>

			{/* Expandable API Reference */}
			<div
				id="api"
				ref={apiRefRef}
				className="mt-6 pt-6 border-t border-platinum"
			>
				<button
					type="button"
					onClick={() => setApiRefExpanded(!apiRefExpanded)}
					className="flex items-center gap-2 text-sm font-medium text-carbon hover:text-hyper-green transition-colors"
				>
					<svg
						className={`w-4 h-4 transition-transform ${apiRefExpanded ? "rotate-90" : ""}`}
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden
					>
						<title>Expand</title>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M9 5l7 7-7 7"
						/>
					</svg>
					{apiRefExpanded ? "Hide API reference" : "View API reference"}
				</button>
				{apiRefExpanded && (
					<div className="mt-4 space-y-4 text-sm">
						<div>
							<h4 className="font-semibold text-carbon mb-2">Authentication</h4>
							<p className="text-muted mb-2">
								Send your key in the{" "}
								<code className="text-xs bg-platinum/50 px-1 rounded font-mono">
									X-Api-Key
								</code>{" "}
								header or{" "}
								<code className="text-xs bg-platinum/50 px-1 rounded font-mono">
									Authorization: Bearer &lt;key&gt;
								</code>
							</p>
						</div>
						<div>
							<h4 className="font-semibold text-carbon mb-2">Base URL</h4>
							<code className="block text-xs bg-platinum/50 px-3 py-2 rounded-lg font-mono text-carbon break-all">
								{origin || "https://yoursite.com"}/api/v1
							</code>
						</div>
						<div>
							<h4 className="font-semibold text-carbon mb-2">Rate limits</h4>
							<p className="text-muted">
								Exports: {API_RATE_LIMITS.export}. Imports:{" "}
								{API_RATE_LIMITS.import}.
							</p>
						</div>
						<div>
							<h4 className="font-semibold text-carbon mb-2">Endpoints</h4>
							<div className="overflow-x-auto rounded-lg border border-platinum">
								<table className="w-full text-left text-xs">
									<thead>
										<tr className="bg-platinum/50">
											<th className="px-3 py-2 font-semibold text-carbon">
												Endpoint
											</th>
											<th className="px-3 py-2 font-semibold text-carbon">
												Method
											</th>
											<th className="px-3 py-2 font-semibold text-carbon">
												Scope
											</th>
											<th className="px-3 py-2 font-semibold text-carbon">
												Format
											</th>
										</tr>
									</thead>
									<tbody>
										{V1_ENDPOINTS.map((ep) => (
											<tr key={ep.path} className="border-t border-platinum/50">
												<td className="px-3 py-2 font-mono text-carbon">
													{ep.path}
												</td>
												<td className="px-3 py-2 text-muted">{ep.method}</td>
												<td className="px-3 py-2 text-muted">{ep.scope}</td>
												<td className="px-3 py-2 text-muted">{ep.format}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
						<div>
							<h4 className="font-semibold text-carbon mb-2">
								Example: Export inventory
							</h4>
							<pre className="text-xs bg-carbon text-platinum p-3 rounded-lg overflow-x-auto font-mono">
								{`curl -H "X-Api-Key: YOUR_KEY" ${origin || "https://yoursite.com"}/api/v1/inventory/export`}
							</pre>
						</div>
						<div className="text-xs text-muted">
							Inventory & supply use CSV. Galley uses JSON. See in-app export
							for format details.
						</div>
						<button
							type="button"
							onClick={() => setApiRefExpanded(false)}
							className="text-xs font-medium text-hyper-green hover:underline"
						>
							Close
						</button>
					</div>
				)}
			</div>
		</section>
	);
}

function ApiKeyRow({ keyRecord }: { keyRecord: ApiKeyRow }) {
	const { confirm } = useConfirm();
	const revokeFetcher = useFetcher<{ success?: boolean; error?: string }>();

	const handleRevoke = async () => {
		if (
			!(await confirm({
				title: "Revoke this API key?",
				message: "It will stop working immediately.",
				confirmLabel: "Revoke",
				variant: "danger",
			}))
		)
			return;
		revokeFetcher.submit(null, {
			method: "delete",
			action: `/api/api-keys/${keyRecord.id}`,
		});
	};

	return (
		<div className="flex items-center justify-between p-3 bg-platinum/30 rounded-lg">
			<div>
				<p className="font-medium text-carbon">{keyRecord.name}</p>
				<p className="text-xs font-mono text-muted">{keyRecord.keyPrefix}...</p>
				<p className="text-xs text-muted mt-1">
					Last used:{" "}
					{keyRecord.lastUsedAt
						? new Date(keyRecord.lastUsedAt).toLocaleString()
						: "Never"}
				</p>
			</div>
			<button
				type="button"
				onClick={handleRevoke}
				disabled={revokeFetcher.state !== "idle"}
				className="px-3 py-1 text-danger text-sm font-medium hover:bg-danger/10 rounded"
			>
				{revokeFetcher.state === "submitting" ? "Revoking..." : "Revoke"}
			</button>
		</div>
	);
}

function ReferenceIdSection({ credits }: { credits: number }) {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					navigate("/");
				},
			},
		});
	};

	if (!session) return null;

	return (
		<section className="glass-panel rounded-xl p-6">
			<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
				{/* User Info */}
				<div className="flex items-center gap-4">
					{session.user.image ? (
						<img
							src={session.user.image}
							alt={session.user.name || "User"}
							className="w-16 h-16 rounded-full border-2 border-platinum object-cover shadow-sm"
						/>
					) : (
						<div className="w-16 h-16 rounded-full bg-platinum/50 flex items-center justify-center text-2xl font-bold text-muted border-2 border-platinum border-dashed">
							{session.user.name?.charAt(0).toUpperCase() || "?"}
						</div>
					)}
					<div>
						<h2 className="text-xl font-bold text-carbon">
							{session.user.name || "Unknown User"}
						</h2>
						<p className="text-sm font-mono text-muted tracking-wide">
							{session.user.email}
						</p>
						<p className="text-xs text-muted/80 mt-1 uppercase tracking-widest">
							ID: {session.user.id.slice(0, 8)}...
						</p>
					</div>
				</div>

				{/* Actions & Credits */}
				<div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
					<div className="text-right">
						<div className="text-xs uppercase text-muted mb-1">
							Available Credits
						</div>
						<div className="text-2xl font-bold tabular-nums tracking-widest text-hyper-green">
							{credits.toString().padStart(4, "0")} CR
						</div>
					</div>

					<div className="h-10 w-px bg-platinum/50 hidden md:block" />

					<button
						type="button"
						onClick={handleSignOut}
						className="px-4 py-2 border border-platinum/50 rounded-lg text-sm text-muted hover:text-carbon hover:bg-platinum/50 transition-all font-medium whitespace-nowrap"
					>
						Log Out
					</button>
				</div>
			</div>
		</section>
	);
}

// biome-ignore lint/suspicious/noExplicitAny: members type is complex from query
function GroupManagement({ members }: { members: any[] }) {
	const session = authClient.useSession();
	const activeOrgId = session.data?.session.activeOrganizationId;
	const [inviteLink, setInviteLink] = useState<string | null>(null);
	const fetcher = useFetcher<{ success: boolean; invitationId: string }>();

	const handleInvite = () => {
		fetcher.submit(
			{},
			{ method: "post", action: "/api/groups/invitations/create" },
		);
	};

	useEffect(() => {
		if (fetcher.data?.success && fetcher.data?.invitationId) {
			setInviteLink(
				`${window.location.origin}/invitations/accept?id=${fetcher.data.invitationId}`,
			);
		}
	}, [fetcher.data]);

	if (!activeOrgId) return null;

	return (
		<section className="glass-panel rounded-xl p-6">
			<div className="flex justify-between items-start mb-6">
				<div>
					<h2 className="text-xl font-bold text-carbon">Group Members</h2>
					<p className="text-sm text-muted">
						Manage who has access to this Cargo
					</p>
				</div>
				<button
					type="button"
					onClick={handleInvite}
					disabled={fetcher.state !== "idle"}
					className="px-4 py-2 bg-platinum text-carbon font-medium rounded-lg hover:bg-platinum/80 transition-colors text-sm disabled:opacity-50"
				>
					{fetcher.state === "submitting" ? "Creating..." : "Invite Member"}
				</button>
			</div>

			{inviteLink && (
				<div className="mb-6 p-4 bg-hyper-green/10 border border-hyper-green/20 rounded-lg">
					<p className="text-xs text-muted font-bold uppercase mb-2">
						Share this link
					</p>
					<div className="flex gap-2">
						<input
							type="text"
							readOnly
							value={inviteLink}
							className="flex-1 bg-white/50 border border-carbon/10 rounded px-3 py-1 text-sm font-mono text-carbon"
							onClick={(e) => e.currentTarget.select()}
						/>
						<button
							type="button"
							onClick={() => {
								navigator.clipboard.writeText(inviteLink);
								alert("Copied to clipboard!");
							}}
							className="px-3 py-1 bg-white text-carbon text-xs font-semibold rounded border border-carbon/10 hover:bg-gray-50"
						>
							Copy
						</button>
					</div>
				</div>
			)}

			<div className="space-y-3">
				{members?.map((member) => (
					<div
						key={member.id}
						className="flex items-center justify-between p-3 bg-platinum/30 rounded-lg"
					>
						<div className="flex items-center gap-3">
							<div className="w-8 h-8 rounded-full bg-hyper-green/20 flex items-center justify-center text-hyper-green font-bold text-xs">
								{member.user.name?.charAt(0).toUpperCase()}
							</div>
							<div>
								<div className="text-sm font-medium text-carbon">
									{member.user.name}
								</div>
								<div className="text-xs text-muted capitalize">
									{member.role}
								</div>
							</div>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
