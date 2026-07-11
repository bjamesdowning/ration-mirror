import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useLoaderData } from "react-router";
import {
	buildMagicLinkVerifyUrl,
	MAGIC_LINK_VERIFY_PARAMS,
} from "~/lib/magic-link-interstitial.server";

/**
 * Inert landing page for magic-link emails. Security scanners prefetch GET links;
 * this page does not consume the Better Auth token until the user submits the form.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
	const url = new URL(request.url);
	const verifyUrl = buildMagicLinkVerifyUrl(
		context.cloudflare.env.BETTER_AUTH_URL,
		url.searchParams,
	);
	if (!verifyUrl) {
		throw redirect("/auth/verify?error=INVALID_TOKEN");
	}

	const callbackURL = url.searchParams.get("callbackURL") ?? "";
	const isMobileHandoff =
		callbackURL.includes("client=ios") ||
		callbackURL.includes("/auth/mobile-callback");

	const hiddenFields: Record<string, string> = {};
	for (const key of MAGIC_LINK_VERIFY_PARAMS) {
		const value = url.searchParams.get(key);
		if (value) hiddenFields[key] = value;
	}

	return { isMobileHandoff, hiddenFields };
}

export async function action({ request, context }: ActionFunctionArgs) {
	const formData = await request.formData();
	const params = new URLSearchParams();
	for (const key of MAGIC_LINK_VERIFY_PARAMS) {
		const value = formData.get(key);
		if (typeof value === "string" && value.length > 0) {
			params.set(key, value);
		}
	}

	const verifyUrl = buildMagicLinkVerifyUrl(
		context.cloudflare.env.BETTER_AUTH_URL,
		params,
	);
	if (!verifyUrl) {
		throw redirect("/auth/verify?error=INVALID_TOKEN");
	}

	throw redirect(verifyUrl);
}

export function meta() {
	return [
		{ title: "Continue sign-in — Ration" },
		{ name: "robots", content: "noindex" },
	];
}

export default function MagicLinkContinue() {
	const { isMobileHandoff, hiddenFields } = useLoaderData<typeof loader>();

	return (
		<div className="min-h-screen bg-ceramic flex items-center justify-center p-6">
			<div className="w-full max-w-md glass-panel rounded-2xl p-8 shadow-xl text-center">
				<h1 className="text-display text-xl text-carbon mb-3">
					Continue to Ration
				</h1>
				<p className="text-sm text-muted mb-6 leading-relaxed">
					Tap below to finish signing in. This step confirms it was you — email
					security scanners cannot complete it for you.
					{isMobileHandoff ? (
						<> Open this link on the same device where you requested sign-in.</>
					) : null}
				</p>
				<Form method="post" className="space-y-3">
					{Object.entries(hiddenFields).map(([key, value]) => (
						<input key={key} type="hidden" name={key} value={value} readOnly />
					))}
					<button
						type="submit"
						className="inline-flex items-center justify-center gap-2 w-full bg-hyper-green text-carbon font-bold py-3 px-6 rounded-xl hover:shadow-glow-sm transition-all focus-ring"
					>
						Continue sign-in →
					</button>
				</Form>
				<p className="text-xs text-muted mt-4 leading-relaxed">
					The link expires in 5 minutes. If it fails, request a new magic link
					from the app or website.
				</p>
			</div>
		</div>
	);
}
