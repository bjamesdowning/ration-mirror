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
import { CheckIcon, SettingsIcon } from "~/components/icons/PageIcons";
import { AllergenSelector } from "~/components/settings/AllergenSelector";
import { PageHeader } from "~/components/shell/PageHeader";
import { Toast } from "~/components/shell/Toast";
import { UpgradePrompt } from "~/components/shell/UpgradePrompt";
import * as schema from "~/db/schema";
import { useToast } from "~/hooks/useToast";
import { type AllergenSlug, parseAllergens } from "~/lib/allergens";
import { API_RATE_LIMITS, V1_ENDPOINTS } from "~/lib/api-docs";
import {
	getUserSettings,
	patchUserSettings,
	requireActiveGroup,
	writeUserSettings,
} from "~/lib/auth.server";
import { authClient } from "~/lib/auth-client";
import { useConfirm } from "~/lib/confirm-context";
import { toExpiryDate } from "~/lib/date-utils";
import { log } from "~/lib/logging.server";
import { type ApiScope, VALID_API_SCOPES } from "~/lib/schemas/api-keys";
import { HubLayoutSchema } from "~/lib/schemas/hub";
import type { UserSettings } from "~/lib/types";
import { APP_VERSION } from "~/lib/version";
import type { Route } from "./+types/settings";

const GITLAB_ISSUES_BASE = "https://gitlab.com/mayutic/ration/application";

// ─── Nav section IDs ──────────────────────────────────────────────────────────
type SectionId =
	| "account"
	| "group"
	| "preferences"
	| "developer"
	| "help"
	| "admin"
	| "danger";

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
	{
		id: "account",
		label: "Account",
		icon: (
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
					d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
				/>
			</svg>
		),
	},
	{
		id: "group",
		label: "Group",
		icon: (
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
					d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
				/>
			</svg>
		),
	},
	{
		id: "preferences",
		label: "Preferences",
		icon: (
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
					d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
				/>
			</svg>
		),
	},
	{
		id: "developer",
		label: "Developer",
		icon: (
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
					d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
				/>
			</svg>
		),
	},
	{
		id: "help",
		label: "Help & Feedback",
		icon: (
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
					d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		),
	},
	{
		id: "danger",
		label: "Danger Zone",
		icon: (
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
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
		),
	},
];

// ─── Loader ───────────────────────────────────────────────────────────────────

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

		const settings = (user.settings as UserSettings) || {};

		const members = await db.query.member.findMany({
			where: (member, { eq }) => eq(member.organizationId, groupId),
			with: {
				user: true,
				organization: true,
			},
		});

		const currentMember = members.find((m) => m.userId === userId);
		const isOwner = currentMember?.role === "owner";
		const currentOrg = members[0]?.organization;

		const userOrganizations = await db.query.member.findMany({
			where: (member, { eq }) => eq(member.userId, userId),
			with: {
				organization: { columns: { id: true, name: true, credits: true } },
			},
		});

		const userMemberships = userOrganizations.map((m) => ({
			organizationId: m.organizationId,
			organizationName: m.organization.name,
			role: m.role,
			credits: m.organization.credits,
		}));

		const { checkBalance } = await import("../../lib/ledger.server");

		const url = new URL(args.request.url);
		const transactionParam = url.searchParams.get("transaction");
		const transactionStatus: "success" | "pending" | "failed" | null =
			transactionParam === "success"
				? "success"
				: transactionParam === "failed"
					? "failed"
					: null;

		const credits = await checkBalance(env, groupId);

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
			userMemberships,
			credits,
			transactionStatus,
			isAdmin: user.isAdmin ?? false,
			tier: user.tier ?? "free",
			tierExpiresAt: user.tierExpiresAt ?? null,
			subscriptionCancelAtPeriodEnd:
				user.subscriptionCancelAtPeriodEnd ?? false,
			apiKeys,
			origin: url.origin,
		};
	} catch (error) {
		log.error("[Settings] Loader failed", error);
		if (error instanceof Response) throw error;
		throw data({ error: "Failed to load settings" }, { status: 500 });
	}
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action(args: Route.ActionArgs) {
	const {
		session: { user: authUser },
	} = await requireActiveGroup(args.context, args.request);
	const userId = authUser.id;

	const formData = await args.request.formData();
	const intent = formData.get("intent");

	const env = args.context.cloudflare.env;

	if (intent === "update-allergens") {
		const raw = formData.get("allergens");
		const allergens = parseAllergens(
			typeof raw === "string" ? (JSON.parse(raw) as unknown) : [],
		);
		await patchUserSettings(env.DB, userId, { allergens });
		return { success: true };
	}

	if (intent === "update-theme") {
		const themeRaw = formData.get("theme");
		const theme =
			themeRaw === "light" || themeRaw === "dark" ? themeRaw : "dark";
		await patchUserSettings(env.DB, userId, { theme });
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
		const clampedDays = Math.min(Math.max(days, 1), 30);
		await patchUserSettings(env.DB, userId, {
			expirationAlertDays: clampedDays,
		});
		return { success: true };
	}

	if (intent === "update-default-group") {
		const defaultGroupId = (formData.get("defaultGroupId") as string)?.trim();
		if (defaultGroupId) {
			// Verify user is a member of the org before persisting (prevents org enumeration)
			const db = drizzle(env.DB, { schema });
			const membership = await db.query.member.findFirst({
				where: (m, { and, eq }) =>
					and(eq(m.organizationId, defaultGroupId), eq(m.userId, userId)),
				columns: { id: true },
			});
			if (!membership) {
				throw data(
					{
						error:
							"You must be a member of that group to set it as your default.",
					},
					{ status: 403 },
				);
			}
		}
		await patchUserSettings(env.DB, userId, {
			defaultGroupId: defaultGroupId || undefined,
		});
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

		if (hubProfile) {
			await patchUserSettings(env.DB, userId, {
				hubProfile,
				...(hubProfile !== "custom" ? { hubLayout: undefined } : {}),
			});
		}
		return { success: true };
	}

	if (intent === "update-hub-layout") {
		const hubLayoutRaw = formData.get("hubLayout");
		if (typeof hubLayoutRaw === "string") {
			try {
				const parsed = JSON.parse(hubLayoutRaw) as unknown;
				const result = HubLayoutSchema.safeParse(parsed);
				if (result.success) {
					await patchUserSettings(env.DB, userId, {
						hubProfile: "custom",
						hubLayout: result.data,
					});
				}
			} catch {
				// Invalid JSON or schema — ignore
			}
		}
		return { success: true };
	}

	if (intent === "update-onboarding") {
		const onboardingStep = Number(formData.get("onboardingStep")) || 0;
		const onboardingCompletedAt =
			formData.get("onboardingCompletedAt") ?? undefined;
		await patchUserSettings(env.DB, userId, {
			onboardingStep,
			onboardingCompletedAt:
				onboardingCompletedAt === undefined
					? undefined
					: onboardingCompletedAt === ""
						? undefined
						: String(onboardingCompletedAt),
		});
		return { success: true };
	}

	if (intent === "restart-onboarding") {
		await patchUserSettings(env.DB, userId, {
			onboardingCompletedAt: undefined,
			onboardingStep: 0,
		});
		return redirect("/hub");
	}

	if (intent === "update-view-mode") {
		const page = formData.get("page") as string;
		const mode = formData.get("mode") as string;

		if (
			(page === "cargo" || page === "galley") &&
			(mode === "card" || mode === "list")
		) {
			// Single read + single write: fetch current settings once, merge the
			// nested viewMode entry, then write the fully-composed object directly.
			const currentSettings = await getUserSettings(env.DB, userId);
			await writeUserSettings(env.DB, userId, {
				...currentSettings,
				viewMode: {
					...((currentSettings.viewMode as UserSettings["viewMode"]) ?? {}),
					[page]: mode,
				},
			});
		}

		return { success: true };
	}

	if (intent === "update-manifest-calendar-span") {
		const spanRaw = formData.get("span") as string;
		const span =
			spanRaw === "3" || spanRaw === "5" || spanRaw === "7"
				? (+spanRaw as 3 | 5 | 7)
				: null;
		if (span !== null) {
			const currentSettings = await getUserSettings(env.DB, userId);
			await writeUserSettings(env.DB, userId, {
				...currentSettings,
				manifestSettings: {
					...currentSettings.manifestSettings,
					calendarSpan: span,
				},
			});
		}
		return { success: true };
	}

	return null;
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function Settings({ loaderData }: Route.ComponentProps) {
	const {
		settings,
		members,
		isOwner,
		organizationId,
		userOrganizations,
		userMemberships = [],
		isAdmin,
	} = loaderData;

	// Determine initial section from URL hash
	const getInitialSection = (): SectionId => {
		if (typeof window !== "undefined") {
			const hash = window.location.hash.replace("#", "");
			if (hash === "api") return "developer";
			const valid: SectionId[] = [
				"account",
				"group",
				"preferences",
				"developer",
				"help",
				"admin",
				"danger",
			];
			if (valid.includes(hash as SectionId)) return hash as SectionId;
		}
		return "account";
	};

	const [activeSection, setActiveSection] =
		useState<SectionId>(getInitialSection);

	const navItems = isAdmin
		? [
				...NAV_ITEMS.slice(0, 5),
				{
					id: "admin" as SectionId,
					label: "Admin",
					icon: (
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
								d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
							/>
						</svg>
					),
				},
				NAV_ITEMS[5],
			]
		: NAV_ITEMS;

	const handleNav = (id: SectionId) => {
		setActiveSection(id);
		if (typeof window !== "undefined") {
			window.history.replaceState(null, "", `#${id}`);
		}
	};

	return (
		<div className="space-y-6">
			<PageHeader
				icon={<SettingsIcon className="w-6 h-6 text-hyper-green" />}
				title="System"
			/>

			{/* ── Mobile: chip strip above content ── */}
			<div className="md:hidden">
				<div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none -mx-1 px-1">
					{navItems.map((item) => {
						const isDanger = item.id === "danger";
						const isActive = activeSection === item.id;
						return (
							<button
								key={item.id}
								type="button"
								onClick={() => handleNav(item.id)}
								className={[
									"flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all",
									isActive && !isDanger
										? "bg-hyper-green text-carbon shadow-glow-sm"
										: isActive && isDanger
											? "bg-danger text-white"
											: isDanger
												? "bg-platinum/50 text-muted hover:text-danger"
												: "bg-platinum/50 text-muted hover:bg-platinum hover:text-carbon",
								].join(" ")}
							>
								{item.icon}
								{item.label}
							</button>
						);
					})}
				</div>
			</div>

			{/* ── Desktop: sidebar nav + content side-by-side ── */}
			<div className="flex gap-8 items-start">
				<nav
					className="hidden md:flex flex-col gap-1 w-44 shrink-0 sticky top-24"
					aria-label="Settings navigation"
				>
					{navItems.map((item) => {
						const isDanger = item.id === "danger";
						const isActive = activeSection === item.id;
						return (
							<button
								key={item.id}
								type="button"
								onClick={() => handleNav(item.id)}
								className={[
									"flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full",
									isActive && !isDanger
										? "bg-hyper-green/10 text-hyper-green border-l-2 border-hyper-green"
										: isActive && isDanger
											? "bg-danger/10 text-danger border-l-2 border-danger"
											: isDanger
												? "text-muted hover:bg-danger/5 hover:text-danger"
												: "text-muted hover:bg-platinum hover:text-carbon",
								].join(" ")}
							>
								{item.icon}
								{item.label}
							</button>
						);
					})}
				</nav>

				{/* Content panel */}
				<div className="flex-1 min-w-0 space-y-6">
					{activeSection === "account" && (
						<AccountSection loaderData={loaderData} />
					)}
					{activeSection === "group" && (
						<GroupSection
							members={members}
							settings={settings}
							userOrganizations={userOrganizations}
							userMemberships={userMemberships}
							tier={loaderData.tier === "crew_member" ? "crew_member" : "free"}
						/>
					)}
					{activeSection === "preferences" && (
						<PreferencesSection settings={settings} />
					)}
					{activeSection === "developer" && (
						<DeveloperSection
							apiKeys={loaderData.apiKeys ?? []}
							organizationName={loaderData.organizationName}
							origin={loaderData.origin ?? ""}
						/>
					)}
					{activeSection === "help" && <HelpSection />}
					{activeSection === "admin" && isAdmin && <AdminSection />}
					{activeSection === "danger" && (
						<DangerSection isOwner={isOwner} organizationId={organizationId} />
					)}
				</div>
			</div>
		</div>
	);
}

// ─── Account Section ──────────────────────────────────────────────────────────

function AccountSection({
	loaderData,
}: {
	loaderData: Route.ComponentProps["loaderData"];
}) {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const billingPortalFetcher = useFetcher<{ url?: string; error?: string }>();

	useEffect(() => {
		if (billingPortalFetcher.data?.url) {
			window.open(
				billingPortalFetcher.data.url,
				"_blank",
				"noopener,noreferrer",
			);
		}
	}, [billingPortalFetcher.data]);

	if (!session) return null;

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => navigate("/"),
			},
		});
	};

	return (
		<div className="space-y-4">
			<SectionHeading>Account</SectionHeading>

			{/* Profile card */}
			<div className="glass-panel rounded-xl p-6">
				<h3 className="text-xs text-label text-muted mb-4">Profile</h3>
				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
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
							<p className="text-xl font-bold text-carbon">
								{session.user.name || "Unknown User"}
							</p>
							<p className="text-sm font-mono text-muted tracking-wide">
								{session.user.email}
							</p>
							<p className="text-xs text-muted/80 mt-1 uppercase tracking-widest">
								ID: {session.user.id.slice(0, 8)}...
							</p>
						</div>
					</div>

					<div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
						<div className="text-right">
							<div className="text-xs uppercase text-muted mb-1">Credits</div>
							<div className="text-2xl font-bold tabular-nums tracking-widest text-hyper-green">
								{loaderData.credits.toString().padStart(4, "0")} CR
							</div>
						</div>
						<div className="h-10 w-px bg-platinum/50 hidden sm:block" />
						<button
							type="button"
							onClick={handleSignOut}
							className="px-4 py-2 border border-platinum/50 rounded-lg text-sm text-muted hover:text-carbon hover:bg-platinum/50 transition-all font-medium whitespace-nowrap"
						>
							Log Out
						</button>
					</div>
				</div>
			</div>

			{/* Plan & billing */}
			<div className="glass-panel rounded-xl p-6">
				<h3 className="text-xs text-label text-muted mb-4">Plan & Billing</h3>

				{/* Transaction banners */}
				{loaderData.transactionStatus === "success" && (
					<div className="mb-6 p-4 bg-success/10 border border-success/20 rounded-lg flex items-center gap-4">
						<CheckIcon className="w-6 h-6 text-success" />
						<div>
							<div className="font-bold text-carbon">Transaction Complete</div>
							<div className="text-sm text-muted">
								Credits have been added to your account.
							</div>
						</div>
					</div>
				)}
				{loaderData.transactionStatus === "failed" && (
					<div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-lg flex items-center gap-4">
						<div className="text-2xl text-danger font-bold">!</div>
						<div>
							<div className="font-bold text-danger">Verification Failed</div>
							<div className="text-sm text-muted">
								Could not verify transaction. Please contact support.
							</div>
						</div>
					</div>
				)}

				<div className="flex items-center justify-between mb-4">
					<div>
						<p className="text-sm text-muted">
							Current tier:{" "}
							<span className="font-semibold text-carbon">
								{loaderData.tier === "crew_member" ? "Crew Member" : "Free"}
							</span>
						</p>
						{loaderData.tier === "crew_member" && (
							<p className="text-xs text-muted mt-1">
								{loaderData.subscriptionCancelAtPeriodEnd
									? "Ends on "
									: "Renews on "}
								{loaderData.tierExpiresAt
									? (toExpiryDate(
											loaderData.tierExpiresAt,
										)?.toLocaleDateString() ?? "unknown")
									: "unknown"}
							</p>
						)}
					</div>
					<span
						className={[
							"px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
							loaderData.tier === "crew_member"
								? "bg-hyper-green/20 text-hyper-green"
								: "bg-platinum text-muted",
						].join(" ")}
					>
						{loaderData.tier === "crew_member" ? "Crew Member" : "Free"}
					</span>
				</div>

				<div className="flex flex-wrap gap-3">
					<Link
						to="/hub/pricing"
						className="px-4 py-2 bg-hyper-green text-carbon rounded-lg font-semibold text-sm hover:bg-hyper-green/90 transition-colors"
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
							className="px-4 py-2 bg-platinum text-carbon rounded-lg font-medium text-sm hover:bg-platinum/80 transition-colors"
						>
							{billingPortalFetcher.state !== "idle"
								? "Loading..."
								: "Manage Subscription"}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

// ─── Group Section ─────────────────────────────────────────────────────────────

function GroupSection({
	members,
	settings,
	userOrganizations,
	userMemberships,
	tier,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: members type is complex from Drizzle query
	members: any[];
	settings: UserSettings;
	userOrganizations: { id: string; name: string; credits: number }[];
	userMemberships: {
		organizationId: string;
		organizationName: string;
		role: string;
		credits: number;
	}[];
	tier: "free" | "crew_member";
}) {
	return (
		<div className="space-y-4">
			<SectionHeading>Group</SectionHeading>
			<GroupManagement members={members} tier={tier} />
			<DefaultGroupCard
				settings={settings}
				userOrganizations={userOrganizations}
			/>
			<TransferCreditsSection userMemberships={userMemberships} />
		</div>
	);
}

// ─── Preferences Section ───────────────────────────────────────────────────────

function AllergenSection({ settings }: { settings: UserSettings }) {
	const fetcher = useFetcher();

	const currentAllergens = parseAllergens(settings.allergens ?? []);
	const isSaving = fetcher.state !== "idle";

	const handleChange = (next: AllergenSlug[]) => {
		fetcher.submit(
			{ intent: "update-allergens", allergens: JSON.stringify(next) },
			{ method: "post" },
		);
	};

	return (
		<div className="glass-panel rounded-xl p-6">
			<h3 className="text-xs text-label text-muted mb-1">
				Dietary Restrictions
			</h3>
			<p className="text-sm text-muted mb-4">
				Select any ingredients you need to avoid. Meals containing these will be
				flagged with a warning everywhere they appear.
			</p>
			<AllergenSelector
				selected={currentAllergens}
				onChange={handleChange}
				disabled={isSaving}
			/>
			{isSaving && (
				<p className="text-xs text-hyper-green animate-pulse mt-3">Saving...</p>
			)}
			{currentAllergens.length > 0 && !isSaving && (
				<p className="text-xs text-muted mt-3">
					{currentAllergens.length} restriction
					{currentAllergens.length !== 1 ? "s" : ""} active
				</p>
			)}
		</div>
	);
}

function PreferencesSection({ settings }: { settings: UserSettings }) {
	const navigation = useNavigation();
	const isUpdatingTheme =
		navigation.state === "submitting" &&
		navigation.formData?.get("intent") === "update-theme";
	const isUpdatingExpiration =
		navigation.state === "submitting" &&
		navigation.formData?.get("intent") === "update-expiration-alert";

	return (
		<div className="space-y-4">
			<SectionHeading>Preferences</SectionHeading>

			{/* Dietary Restrictions */}
			<AllergenSection settings={settings} />

			{/* Appearance */}
			<div className="glass-panel rounded-xl p-6">
				<h3 className="text-xs text-label text-muted mb-1">Appearance</h3>
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
								document.documentElement.classList.remove("dark");
								e.target.form?.requestSubmit();
							}}
						/>
						<span className="text-carbon text-sm">Light</span>
					</label>
					<label className="flex items-center gap-2 cursor-pointer">
						<input
							type="radio"
							name="theme"
							value="dark"
							defaultChecked={settings.theme === "dark"}
							className="w-4 h-4 accent-hyper-green"
							onChange={(e) => {
								document.documentElement.classList.add("dark");
								e.target.form?.requestSubmit();
							}}
						/>
						<span className="text-carbon text-sm">Dark</span>
					</label>
					{isUpdatingTheme && (
						<span className="text-hyper-green animate-pulse text-sm my-auto">
							Saving...
						</span>
					)}
				</Form>
			</div>

			{/* Expiration alerts */}
			<div className="glass-panel rounded-xl p-6">
				<h3 className="text-xs text-label text-muted mb-1">
					Expiration Alerts
				</h3>
				<p className="text-sm text-muted mb-4">
					Get alerts for items expiring within this many days
				</p>
				<Form method="post" className="flex items-center gap-4">
					<input type="hidden" name="intent" value="update-expiration-alert" />
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
					<span className="text-carbon font-bold min-w-[60px] text-right text-sm">
						{settings.expirationAlertDays || 7} days
					</span>
					{isUpdatingExpiration && (
						<span className="text-hyper-green animate-pulse text-sm">
							Saving...
						</span>
					)}
				</Form>
			</div>

			{/* Default View */}
			<ViewModeSection settings={settings} />

			{/* Manifest Calendar */}
			<ManifestCalendarSection settings={settings} />

			{/* Hub Layout */}
			<div className="glass-panel rounded-xl p-6">
				<h3 className="text-xs text-label text-muted mb-1">Hub Layout</h3>
				<p className="text-sm text-muted mb-4">
					Customize which widgets appear on your Hub and how they're arranged.
				</p>
				<Link
					to="/hub?edit=1"
					className="inline-flex items-center gap-2 px-4 py-2 bg-hyper-green/10 text-hyper-green rounded-lg font-medium text-sm hover:bg-hyper-green/20 transition-colors"
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
			</div>
		</div>
	);
}

// ─── View Mode Section ─────────────────────────────────────────────────────────

function ViewModeSection({ settings }: { settings: UserSettings }) {
	const fetcher = useFetcher();

	const cargoMode =
		(settings.viewMode as { cargo?: string; galley?: string } | undefined)
			?.cargo === "list"
			? "list"
			: "card";
	const galleyMode =
		(settings.viewMode as { cargo?: string; galley?: string } | undefined)
			?.galley === "list"
			? "list"
			: "card";

	const handleChange = (page: "cargo" | "galley", mode: "card" | "list") => {
		fetcher.submit(
			{ intent: "update-view-mode", page, mode },
			{ method: "post" },
		);
	};

	return (
		<div className="glass-panel rounded-xl p-6">
			<h3 className="text-xs text-label text-muted mb-1">Default View</h3>
			<p className="text-sm text-muted mb-4">
				Set the default display mode for Cargo and Galley. You can always toggle
				this on the page itself.
			</p>
			<div className="space-y-4">
				{(
					[
						{ page: "cargo", label: "Cargo", mode: cargoMode },
						{ page: "galley", label: "Galley", mode: galleyMode },
					] as const
				).map(({ page, label, mode }) => (
					<div key={page} className="flex items-center justify-between">
						<span className="text-sm text-carbon">{label}</span>
						<fieldset className="flex items-center rounded-lg overflow-hidden border border-platinum m-0 p-0">
							<legend className="sr-only">Default {label} view</legend>
							<button
								type="button"
								onClick={() => handleChange(page, "card")}
								aria-pressed={mode === "card"}
								className={`px-4 py-2 text-sm font-medium transition-colors ${
									mode === "card"
										? "bg-hyper-green text-carbon"
										: "text-muted hover:bg-platinum/50"
								}`}
							>
								Card
							</button>
							<button
								type="button"
								onClick={() => handleChange(page, "list")}
								aria-pressed={mode === "list"}
								className={`px-4 py-2 text-sm font-medium transition-colors ${
									mode === "list"
										? "bg-hyper-green text-carbon"
										: "text-muted hover:bg-platinum/50"
								}`}
							>
								List
							</button>
						</fieldset>
					</div>
				))}
				{fetcher.state !== "idle" && (
					<span className="text-hyper-green animate-pulse text-sm">
						Saving...
					</span>
				)}
			</div>
		</div>
	);
}

// ─── Manifest Calendar Section ─────────────────────────────────────────────────

function ManifestCalendarSection({ settings }: { settings: UserSettings }) {
	const fetcher = useFetcher();

	const calendarSpan =
		(settings.manifestSettings as { calendarSpan?: 3 | 5 | 7 } | undefined)
			?.calendarSpan ?? 5;

	const handleChange = (span: 3 | 5 | 7) => {
		fetcher.submit(
			{ intent: "update-manifest-calendar-span", span: String(span) },
			{ method: "post" },
		);
	};

	return (
		<div className="glass-panel rounded-xl p-6">
			<h3 className="text-xs text-label text-muted mb-1">Manifest Calendar</h3>
			<p className="text-sm text-muted mb-4">
				Default number of days shown in the Manifest on desktop. Mobile always
				shows one day at a time.
			</p>
			<div className="flex items-center gap-2">
				<fieldset
					className="flex items-center rounded-lg overflow-hidden border border-platinum m-0 p-0"
					aria-label="Manifest calendar span"
				>
					<legend className="sr-only">Number of days shown in Manifest</legend>
					{([3, 5, 7] as const).map((span) => (
						<button
							key={span}
							type="button"
							onClick={() => handleChange(span)}
							aria-pressed={calendarSpan === span}
							aria-label={`${span} days`}
							className={`px-4 py-2 text-sm font-medium transition-colors ${
								calendarSpan === span
									? "bg-hyper-green text-carbon"
									: "text-muted hover:bg-platinum/50"
							}`}
						>
							{span} days
						</button>
					))}
				</fieldset>
				{fetcher.state !== "idle" && (
					<span className="text-hyper-green animate-pulse text-sm">
						Saving...
					</span>
				)}
			</div>
		</div>
	);
}

// ─── Developer Section ─────────────────────────────────────────────────────────

function DeveloperSection({
	apiKeys,
	organizationName,
	origin,
}: {
	apiKeys: ApiKeyRow[];
	organizationName: string;
	origin: string;
}) {
	return (
		<div className="space-y-4">
			<SectionHeading>Developer</SectionHeading>
			<ApiKeysSection
				apiKeys={apiKeys}
				organizationName={organizationName}
				origin={origin}
			/>
		</div>
	);
}

// ─── Help Section ──────────────────────────────────────────────────────────────

function HelpSection() {
	const bugUrl = `${GITLAB_ISSUES_BASE}/-/issues/new?issuable_template=bug`;
	const featureUrl = `${GITLAB_ISSUES_BASE}/-/issues/new?issuable_template=feature-request`;

	return (
		<div className="space-y-4">
			<SectionHeading>Help & Feedback</SectionHeading>
			<div className="glass-panel rounded-xl p-6 space-y-6">
				<div>
					<h3 className="text-xs text-label text-muted mb-1">Contact</h3>
					<p className="text-sm text-muted mb-2">
						Questions, billing, or account help — reach us by email.
					</p>
					<a
						href="mailto:help@mayutic.com"
						className="text-hyper-green font-medium hover:underline"
					>
						help@mayutic.com
					</a>
				</div>

				<div>
					<h3 className="text-xs text-label text-muted mb-1">Feedback</h3>
					<p className="text-sm text-muted mb-3">
						Report bugs or suggest features via our issue tracker.
					</p>
					<div className="flex flex-wrap gap-3">
						<a
							href={bugUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 px-4 py-2 bg-hyper-green/10 text-hyper-green rounded-lg font-medium text-sm hover:bg-hyper-green/20 transition-colors"
						>
							Report a bug
						</a>
						<a
							href={featureUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 px-4 py-2 bg-hyper-green/10 text-hyper-green rounded-lg font-medium text-sm hover:bg-hyper-green/20 transition-colors"
						>
							Request a feature
						</a>
					</div>
				</div>

				<div>
					<h3 className="text-xs text-label text-muted mb-1">Tutorial</h3>
					<p className="text-sm text-muted mb-4">
						Replay the onboarding tour to revisit the Ration workflow and
						feature overview.
					</p>
					<Form method="post">
						<input type="hidden" name="intent" value="restart-onboarding" />
						<button
							type="submit"
							className="inline-flex items-center gap-2 px-4 py-2 bg-hyper-green/10 text-hyper-green rounded-lg font-medium text-sm hover:bg-hyper-green/20 transition-colors"
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
									d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
								/>
							</svg>
							Restart Tutorial
						</button>
					</Form>
				</div>

				<div className="pt-4 border-t border-platinum">
					<div className="flex flex-wrap gap-4 text-sm text-muted">
						<Link
							to="/legal/terms"
							className="hover:text-hyper-green transition-colors"
						>
							Terms of Service
						</Link>
						<Link
							to="/legal/privacy"
							className="hover:text-hyper-green transition-colors"
						>
							Privacy Policy
						</Link>
					</div>
					<p className="text-xs text-muted mt-3">Ration v{APP_VERSION}</p>
				</div>
			</div>
		</div>
	);
}

// ─── Admin Section ─────────────────────────────────────────────────────────────

function AdminSection() {
	return (
		<div className="space-y-4">
			<SectionHeading>Administration</SectionHeading>
			<div className="glass-panel rounded-xl p-6">
				<h3 className="text-xs text-label text-muted mb-1">System Dashboard</h3>
				<p className="text-sm text-muted mb-4">
					System-wide management and metrics
				</p>
				<Link
					to="/admin"
					className="inline-flex items-center gap-2 px-4 py-2 bg-hyper-green/10 text-hyper-green rounded-lg font-medium text-sm hover:bg-hyper-green/20 transition-colors"
				>
					Admin Dashboard
				</Link>
			</div>
		</div>
	);
}

// ─── Danger Section ────────────────────────────────────────────────────────────

function DangerSection({
	isOwner,
	organizationId,
}: {
	isOwner: boolean;
	organizationId: string;
}) {
	const { confirm } = useConfirm();
	const purgeFetcher = useFetcher();
	const deleteGroupFetcher = useFetcher();
	const isPurging = purgeFetcher.state !== "idle";
	const isDeletingGroup = deleteGroupFetcher.state !== "idle";

	return (
		<div className="space-y-4">
			<SectionHeading>Danger Zone</SectionHeading>

			<div className="bg-danger/5 border border-danger/20 rounded-xl p-6 space-y-6">
				{/* Delete Account */}
				<div>
					<h3 className="text-sm font-bold text-danger mb-1">Delete Account</h3>
					<p className="text-sm text-muted mb-4 max-w-md">
						Complete removal of your account and data. This action deletes all
						inventory, ledger history, and user records. This cannot be undone.
					</p>
					<button
						type="button"
						disabled={isPurging}
						onClick={async () => {
							if (
								!(await confirm({
									title: "Delete your account permanently?",
									message:
										"There is no recovery path. This cannot be reversed by support.",
									consequences: [
										"All inventory items and their history",
										"Your remaining credit balance (non-refundable)",
										"Active subscription — no pro-rated refund",
										"All meal plans and recipes",
										"All group memberships and shared data you own",
										"API keys — all integrations will stop working immediately",
									],
									requireTyped: "delete",
									confirmLabel: "Delete My Account",
									variant: "danger",
								}))
							)
								return;
							purgeFetcher.submit(null, {
								method: "post",
								action: "/api/user/purge",
							});
						}}
						className="px-4 py-2 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 transition-colors disabled:opacity-50 text-sm font-medium"
					>
						{isPurging ? "Deleting..." : "Delete Account"}
					</button>
				</div>

				{/* Delete Group — owner only */}
				{isOwner && (
					<div className="pt-6 border-t border-danger/20">
						<h3 className="text-sm font-bold text-danger mb-1">Delete Group</h3>
						<p className="text-sm text-muted mb-4 max-w-md">
							Permanently delete this group and all its data (inventory, meals,
							lists). This cannot be undone.
						</p>
						<button
							type="button"
							disabled={isDeletingGroup}
							onClick={async () => {
								if (
									!(await confirm({
										title: "Delete this group permanently?",
										message:
											"All members will lose access immediately. This cannot be undone.",
										consequences: [
											"All shared inventory items",
											"All meal plans and recipes",
											"All supply lists",
											"All member invitations and access",
										],
										requireTyped: "delete",
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
							className="px-4 py-2 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 transition-colors disabled:opacity-50 text-sm font-medium"
						>
							{isDeletingGroup ? "Deleting..." : "Delete Group"}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="text-xs text-label text-muted tracking-widest uppercase px-1">
			{children}
		</h2>
	);
}

function DefaultGroupCard({
	settings,
	userOrganizations,
}: {
	settings: UserSettings;
	userOrganizations: { id: string; name: string; credits: number }[];
}) {
	const navigation = useNavigation();
	const isUpdating =
		navigation.state === "submitting" &&
		navigation.formData?.get("intent") === "update-default-group";

	return (
		<div className="glass-panel rounded-xl p-6">
			<h3 className="text-xs text-label text-muted mb-1">Default Group</h3>
			<p className="text-sm text-muted mb-4">
				Select which group to activate when you sign in
			</p>
			<Form method="post" className="flex items-center gap-4">
				<input type="hidden" name="intent" value="update-default-group" />
				<select
					name="defaultGroupId"
					defaultValue={settings.defaultGroupId || ""}
					onChange={(e) => e.target.form?.requestSubmit()}
					className="flex-1 px-4 py-2 bg-platinum/50 border border-carbon/10 rounded-lg text-carbon text-sm focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
				>
					<option value="">Auto-select (Personal Group)</option>
					{userOrganizations?.map((org) => (
						<option key={org.id} value={org.id}>
							{org.name}
						</option>
					))}
				</select>
				{isUpdating && (
					<span className="text-hyper-green animate-pulse text-sm">
						Saving...
					</span>
				)}
			</Form>
		</div>
	);
}

// ─── API Keys ──────────────────────────────────────────────────────────────────

const SCOPE_META: Record<
	ApiScope,
	{ label: string; description: string; color: string }
> = {
	inventory: {
		label: "Inventory",
		description: "Read & write pantry items",
		color: "bg-platinum text-carbon",
	},
	galley: {
		label: "Galley",
		description: "Read & write meals & recipes",
		color: "bg-platinum text-carbon",
	},
	supply: {
		label: "Supply",
		description: "Read & write shopping lists",
		color: "bg-platinum text-carbon",
	},
	mcp: {
		label: "MCP",
		description: "Agent access via Model Context Protocol",
		color: "bg-hyper-green/20 text-hyper-green border border-hyper-green/30",
	},
};

const DEFAULT_SCOPES: ApiScope[] = ["inventory", "galley", "supply"];

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
	const [mcpRefExpanded, setMcpRefExpanded] = useState(false);
	const apiRefRef = useRef<HTMLDivElement>(null);
	const copyToast = useToast({ duration: 3000 });

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
		scopes?: string;
		createdAt?: string;
		error?: string;
	}>();
	const [newKeyDisplay, setNewKeyDisplay] = useState<string | null>(null);
	const [createName, setCreateName] = useState("");
	const [selectedScopes, setSelectedScopes] =
		useState<ApiScope[]>(DEFAULT_SCOPES);

	useEffect(() => {
		if (createFetcher.data?.key && createFetcher.state === "idle") {
			setNewKeyDisplay(createFetcher.data.key);
			setCreateName("");
			setSelectedScopes(DEFAULT_SCOPES);
		}
	}, [createFetcher.data?.key, createFetcher.state]);

	const toggleScope = (scope: ApiScope) => {
		setSelectedScopes((prev) =>
			prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
		);
	};

	const canSubmit =
		createFetcher.state === "idle" &&
		createName.trim().length > 0 &&
		selectedScopes.length > 0;

	const handleCreate = (e: React.FormEvent) => {
		if (!canSubmit) e.preventDefault();
		else setNewKeyDisplay(null);
	};

	return (
		<section className="glass-panel rounded-xl p-6">
			<h3 className="text-xs text-label text-muted mb-1">API Keys</h3>
			<p className="text-sm text-muted mb-4">
				Create keys with configurable access scopes for{" "}
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
								copyToast.show();
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
				className="mb-6 space-y-3"
			>
				<div className="flex gap-2">
					<input
						type="text"
						name="name"
						value={createName}
						onChange={(e) => setCreateName(e.target.value)}
						placeholder="Key name (e.g. cursor_mcp)"
						className="flex-1 max-w-xs px-4 py-2 bg-platinum/50 border border-carbon/10 rounded-lg text-carbon placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
						maxLength={100}
					/>
					<button
						type="submit"
						disabled={!canSubmit}
						className="px-4 py-2 bg-hyper-green text-carbon rounded-lg font-semibold text-sm hover:bg-hyper-green/90 disabled:opacity-50"
					>
						{createFetcher.state === "submitting"
							? "Creating..."
							: "Create key"}
					</button>
				</div>

				{/* Scope selector */}
				<div>
					<p className="text-xs text-muted mb-2 font-medium uppercase tracking-wide">
						Scopes
					</p>
					<div className="flex flex-wrap gap-2">
						{VALID_API_SCOPES.map((scope) => {
							const meta = SCOPE_META[scope];
							const active = selectedScopes.includes(scope);
							return (
								<button
									key={scope}
									type="button"
									onClick={() => toggleScope(scope)}
									title={meta.description}
									className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
										active
											? scope === "mcp"
												? "bg-hyper-green/20 text-hyper-green border-hyper-green/40"
												: "bg-carbon text-ceramic border-carbon"
											: "bg-platinum/30 text-muted border-carbon/10 hover:border-carbon/30"
									}`}
								>
									{active && (
										<svg
											className="w-3 h-3 shrink-0"
											viewBox="0 0 12 12"
											fill="currentColor"
											role="presentation"
										>
											<path
												d="M10 3L5 8.5 2 5.5"
												stroke="currentColor"
												strokeWidth="1.5"
												fill="none"
												strokeLinecap="round"
												strokeLinejoin="round"
											/>
										</svg>
									)}
									{meta.label}
								</button>
							);
						})}
					</div>
					{selectedScopes.length === 0 && (
						<p className="text-xs text-danger mt-1">
							Select at least one scope.
						</p>
					)}
				</div>

				{/* Hidden inputs — one per selected scope (multi-value form pattern) */}
				{selectedScopes.map((scope) => (
					<input key={scope} type="hidden" name="scopes" value={scope} />
				))}
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
					apiKeys.map((k) => <ApiKeyRowItem key={k.id} keyRecord={k} />)
				)}
			</div>

			{copyToast.isOpen && (
				<Toast
					variant="success"
					title="Copied"
					description="API key copied to clipboard"
					onDismiss={copyToast.hide}
				/>
			)}

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

			<McpReferencePanel
				expanded={mcpRefExpanded}
				onToggle={() => setMcpRefExpanded((v) => !v)}
				onClose={() => setMcpRefExpanded(false)}
			/>
		</section>
	);
}

// ─── MCP Reference Panel ───────────────────────────────────────────────────────

const MCP_TOOLS = [
	{
		name: "search_ingredients",
		description: "Semantic vector search for pantry items",
		params: "query (string), topK (1–20, optional)",
	},
	{
		name: "list_inventory",
		description: "Full pantry listing",
		params: "domain (food/household/alcohol, optional)",
	},
	{
		name: "get_supply_list",
		description: "Active shopping list with source meals",
		params: "none",
	},
	{
		name: "list_meals",
		description: "All recipes with ingredients",
		params: "tag (string, optional)",
	},
] as const;

const MCP_CONFIG_SNIPPET = `{
  "mcpServers": {
    "ration": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.ration.mayutic.com/mcp",
        "--header",
        "Authorization:\${RATION_AUTH_HEADER}"
      ],
      "env": {
        "RATION_AUTH_HEADER": "Bearer <your-mcp-scoped-key>"
      }
    }
  }
}`;

function McpReferencePanel({
	expanded,
	onToggle,
	onClose,
}: {
	expanded: boolean;
	onToggle: () => void;
	onClose: () => void;
}) {
	const copyToast = useToast({ duration: 3000 });
	return (
		<div className="mt-6 pt-6 border-t border-platinum">
			<button
				type="button"
				onClick={onToggle}
				className="flex items-center gap-2 text-sm font-medium text-carbon hover:text-hyper-green transition-colors"
			>
				<svg
					className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`}
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
				<span
					className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-hyper-green/20 text-hyper-green border border-hyper-green/30 mr-1"
					aria-hidden
				>
					MCP
				</span>
				{expanded ? "Hide MCP reference" : "View MCP reference"}
			</button>

			{expanded && (
				<div className="mt-4 space-y-5 text-sm">
					<p className="text-muted">
						Connect any MCP-compatible AI client to your Ration data in real
						time. Query your inventory, meals, and shopping list from Claude,
						Cursor, or any agent that supports the Model Context Protocol.
					</p>

					<div>
						<h4 className="font-semibold text-carbon mb-2">Endpoint</h4>
						<code className="block text-xs bg-platinum/50 px-3 py-2 rounded-lg font-mono text-carbon break-all">
							https://mcp.ration.mayutic.com/mcp
						</code>
					</div>

					<div>
						<h4 className="font-semibold text-carbon mb-2">Authentication</h4>
						<p className="text-muted mb-1">
							Generate a key with the{" "}
							<span className="font-medium text-hyper-green">MCP</span> scope
							above, then pass it as a Bearer token.
						</p>
					</div>

					<div>
						<h4 className="font-semibold text-carbon mb-2">
							Claude Desktop / Cursor config
						</h4>
						<div className="relative group">
							<pre className="text-xs bg-carbon text-platinum p-4 rounded-lg overflow-x-auto font-mono leading-relaxed">
								{MCP_CONFIG_SNIPPET}
							</pre>
							<button
								type="button"
								onClick={() => {
									navigator.clipboard.writeText(MCP_CONFIG_SNIPPET);
									copyToast.show();
								}}
								className="absolute top-2 right-2 px-2 py-1 bg-platinum/10 text-platinum text-[10px] font-semibold rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-platinum/20"
							>
								Copy
							</button>
						</div>
						<p className="text-xs text-muted mt-2">
							Replace{" "}
							<code className="bg-platinum/50 px-1 rounded font-mono">
								&lt;your-mcp-scoped-key&gt;
							</code>{" "}
							with the key you generated above. The{" "}
							<code className="bg-platinum/50 px-1 rounded font-mono">
								RATION_AUTH_HEADER
							</code>{" "}
							env var is read by{" "}
							<code className="bg-platinum/50 px-1 rounded font-mono">
								mcp-remote
							</code>{" "}
							at runtime — your key is never hardcoded.
						</p>
					</div>

					<div>
						<h4 className="font-semibold text-carbon mb-2">Available tools</h4>
						<div className="overflow-x-auto rounded-lg border border-platinum">
							<table className="w-full text-left text-xs">
								<thead>
									<tr className="bg-platinum/50">
										<th className="px-3 py-2 font-semibold text-carbon">
											Tool
										</th>
										<th className="px-3 py-2 font-semibold text-carbon">
											Description
										</th>
										<th className="px-3 py-2 font-semibold text-carbon">
											Parameters
										</th>
									</tr>
								</thead>
								<tbody>
									{MCP_TOOLS.map((tool) => (
										<tr key={tool.name} className="border-t border-platinum/50">
											<td className="px-3 py-2 font-mono text-hyper-green">
												{tool.name}
											</td>
											<td className="px-3 py-2 text-muted">
												{tool.description}
											</td>
											<td className="px-3 py-2 text-muted font-mono">
												{tool.params}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>

					<div className="text-xs text-muted p-3 bg-platinum/30 rounded-lg">
						<span className="font-semibold text-carbon">Rate limits:</span>{" "}
						<code className="font-mono">search_ingredients</code> is subject to
						the MCP search bucket limit. All other tools are read-only with no
						additional credit cost.
					</div>

					<button
						type="button"
						onClick={onClose}
						className="text-xs font-medium text-hyper-green hover:underline"
					>
						Close
					</button>
				</div>
			)}

			{copyToast.isOpen && (
				<Toast
					variant="success"
					title="Copied"
					description="Config snippet copied to clipboard"
					onDismiss={copyToast.hide}
				/>
			)}
		</div>
	);
}

function ApiKeyRowItem({ keyRecord }: { keyRecord: ApiKeyRow }) {
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

	let parsedScopes: ApiScope[] = [];
	try {
		const raw = JSON.parse(keyRecord.scopes);
		if (Array.isArray(raw)) {
			parsedScopes = raw.filter(
				(s): s is ApiScope =>
					typeof s === "string" &&
					(VALID_API_SCOPES as readonly string[]).includes(s),
			);
		}
	} catch {
		// malformed scopes — render nothing
	}

	return (
		<div className="flex items-center justify-between p-3 bg-platinum/30 rounded-lg">
			<div>
				<div className="flex items-center gap-2 mb-0.5">
					<p className="font-medium text-carbon text-sm">{keyRecord.name}</p>
					<div className="flex gap-1">
						{parsedScopes.map((scope) => (
							<span
								key={scope}
								className={`px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${SCOPE_META[scope].color}`}
							>
								{SCOPE_META[scope].label}
							</span>
						))}
					</div>
				</div>
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

// ─── Transfer Credits ──────────────────────────────────────────────────────────

type UserMembership = {
	organizationId: string;
	organizationName: string;
	role: string;
	credits: number;
};

function TransferCreditsSection({
	userMemberships,
}: {
	userMemberships: UserMembership[];
}) {
	const fetcher = useFetcher<{ success?: boolean; error?: string }>();
	const toast = useToast({ duration: 3000 });
	const [sourceId, setSourceId] = useState<string>("");

	const sourceGroups = userMemberships.filter(
		(m) => m.role === "owner" && m.credits > 0,
	);
	const destGroups = userMemberships.filter(
		(m) => m.organizationId !== sourceId,
	);
	const sourceMembership = userMemberships.find(
		(m) => m.organizationId === sourceId,
	);
	const maxAmount = sourceMembership?.credits ?? 0;
	const canShow = sourceGroups.length > 0 && userMemberships.length > 1;

	useEffect(() => {
		if (fetcher.data?.success && fetcher.state === "idle") {
			toast.show();
			setSourceId("");
		}
	}, [fetcher.data?.success, fetcher.state, toast]);

	if (!canShow) return null;

	return (
		<div className="glass-panel rounded-xl p-6">
			<h3 className="text-xs text-label text-muted mb-1">Transfer Credits</h3>
			<p className="text-sm text-muted mb-4">
				Move credits from groups you own to other groups you belong to.
			</p>

			{fetcher.data?.error && fetcher.state === "idle" && (
				<div className="mb-4 p-4 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm">
					{fetcher.data.error}
				</div>
			)}

			<fetcher.Form
				method="post"
				action="/api/groups/credits/transfer"
				className="space-y-4"
			>
				<div>
					<label
						htmlFor="transfer-source"
						className="block text-sm font-medium text-carbon mb-1"
					>
						From (source)
					</label>
					<select
						id="transfer-source"
						name="sourceOrganizationId"
						value={sourceId}
						onChange={(e) => setSourceId(e.target.value)}
						required
						className="w-full px-4 py-2 bg-platinum/50 border border-carbon/10 rounded-lg text-carbon text-sm focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
					>
						<option value="">Select group...</option>
						{sourceGroups.map((m) => (
							<option key={m.organizationId} value={m.organizationId}>
								{m.organizationName} ({m.credits} CR)
							</option>
						))}
					</select>
				</div>

				<div>
					<label
						htmlFor="transfer-dest"
						className="block text-sm font-medium text-carbon mb-1"
					>
						To (destination)
					</label>
					<select
						id="transfer-dest"
						name="destinationOrganizationId"
						required
						disabled={!sourceId || destGroups.length === 0}
						className="w-full px-4 py-2 bg-platinum/50 border border-carbon/10 rounded-lg text-carbon text-sm focus:outline-none focus:ring-2 focus:ring-hyper-green/50 disabled:opacity-60"
					>
						<option value="">Select group...</option>
						{destGroups.map((m) => (
							<option key={m.organizationId} value={m.organizationId}>
								{m.organizationName}
								{m.role === "owner" ? " (owner)" : " (member)"}
							</option>
						))}
					</select>
				</div>

				<div>
					<label
						htmlFor="transfer-amount"
						className="block text-sm font-medium text-carbon mb-1"
					>
						Amount
					</label>
					<input
						id="transfer-amount"
						type="number"
						name="amount"
						min={1}
						max={maxAmount}
						disabled={!sourceId}
						required
						className="w-full px-4 py-2 bg-platinum/50 border border-carbon/10 rounded-lg text-carbon text-sm focus:outline-none focus:ring-2 focus:ring-hyper-green/50 disabled:opacity-60"
						placeholder={sourceId ? `Max ${maxAmount}` : "Select source first"}
					/>
					{sourceId && (
						<p className="text-xs text-muted mt-1">Max: {maxAmount} CR</p>
					)}
				</div>

				<button
					type="submit"
					disabled={
						fetcher.state !== "idle" || !sourceId || destGroups.length === 0
					}
					className="px-4 py-2 bg-hyper-green text-carbon rounded-lg font-semibold text-sm hover:bg-hyper-green/90 disabled:opacity-60 disabled:cursor-not-allowed"
				>
					{fetcher.state !== "idle" ? "Transferring..." : "Transfer Credits"}
				</button>
			</fetcher.Form>

			{toast.isOpen && (
				<Toast
					variant="success"
					title="Transfer complete"
					description="Credits have been transferred."
					onDismiss={toast.hide}
				/>
			)}
		</div>
	);
}

// ─── Group Management ──────────────────────────────────────────────────────────

function GroupManagement({
	members,
	tier,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: members type is complex from Drizzle query
	members: any[];
	tier: "free" | "crew_member";
}) {
	const session = authClient.useSession();
	const activeOrgId = session.data?.session.activeOrganizationId;
	const [inviteLink, setInviteLink] = useState<string | null>(null);
	const [showUpgrade, setShowUpgrade] = useState(false);
	const fetcher = useFetcher<{
		success?: boolean;
		invitationId?: string;
		error?: string;
	}>();
	const copyToast = useToast({ duration: 3000 });

	const isFree = tier !== "crew_member";

	const handleInvite = () => {
		if (isFree) {
			setShowUpgrade(true);
			return;
		}
		fetcher.submit(
			{},
			{ method: "post", action: "/api/groups/invitations/create" },
		);
	};

	useEffect(() => {
		if (fetcher.state !== "idle" || !fetcher.data) return;
		if (fetcher.data.error === "feature_gated") {
			setShowUpgrade(true);
			return;
		}
		if (fetcher.data.success && fetcher.data.invitationId) {
			setInviteLink(
				`${window.location.origin}/invitations/accept?id=${fetcher.data.invitationId}`,
			);
		}
	}, [fetcher.data, fetcher.state]);

	if (!activeOrgId) return null;

	return (
		<div className="glass-panel rounded-xl p-6">
			<UpgradePrompt
				open={showUpgrade}
				onClose={() => setShowUpgrade(false)}
				title="Crew Member required"
				description="Inviting members to your group is a Crew Member feature. Upgrade to collaborate with others."
			/>

			<div className="flex justify-between items-start mb-6">
				<div>
					<h3 className="text-xs text-label text-muted mb-1">Members</h3>
					<p className="text-sm text-muted">
						Manage who has access to this Cargo
					</p>
				</div>
				<button
					type="button"
					onClick={handleInvite}
					disabled={fetcher.state !== "idle"}
					className="px-4 py-2 bg-platinum text-carbon font-medium rounded-lg hover:bg-platinum/80 transition-colors text-sm disabled:opacity-50 flex items-center gap-2"
				>
					{fetcher.state === "submitting" ? (
						"Creating..."
					) : (
						<>
							Invite Member
							{isFree && (
								<span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-hyper-green/20 text-hyper-green rounded">
									Crew
								</span>
							)}
						</>
					)}
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
								copyToast.show();
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

			{copyToast.isOpen && (
				<Toast
					variant="success"
					title="Copied"
					description="Invite link copied to clipboard"
					onDismiss={copyToast.hide}
				/>
			)}
		</div>
	);
}
