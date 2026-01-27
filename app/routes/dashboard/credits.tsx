// @ts-nocheck

import {
	EmbeddedCheckout,
	EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { requireAuth } from "~/lib/auth.server";
import { checkBalance, processCheckoutSession } from "~/lib/ledger.server";
import type { Route } from "./+types/credits";

export async function loader({ request, context }: Route.LoaderArgs) {
	const { user } = await requireAuth(context, request);
	const url = new URL(request.url);
	const sessionId = url.searchParams.get("session_id");

	let transactionStatus: "success" | "pending" | "failed" | null = null;

	// Pull Mechanism: Verify and fulfill immediately if returning from Stripe
	if (sessionId) {
		try {
			await processCheckoutSession(context.cloudflare.env, sessionId);
			transactionStatus = "success";
		} catch (error) {
			console.error("Manual fulfillment failed:", error);
			// We don't block the page load, but we won't show the success screen
			transactionStatus = "failed";
		}
	}

	// Fetch fresh balance (after potential fulfillment)
	const balance = await checkBalance(context.cloudflare.env, user.id);

	return {
		balance,
		stripePublishableKey: context.cloudflare.env.STRIPE_PUBLISHABLE_KEY,
		transactionStatus,
	};
}

export default function CreditsPage({ loaderData }: Route.ComponentProps) {
	const { balance, stripePublishableKey } = loaderData;
	const [searchParams] = useSearchParams();
	const sessionId = searchParams.get("session_id");

	const checkoutFetcher = useFetcher();
	const [clientSecret, setClientSecret] = useState<string | null>(null);

	// Initialize Stripe
	const stripePromise = loadStripe(stripePublishableKey);

	const handlePurchase = async (packKey: "SMALL" | "LARGE") => {
		const formData = new FormData();
		formData.append("pack", packKey);

		checkoutFetcher.submit(formData, {
			method: "post",
			action: "/api/checkout",
		});
	};

	// When checkout session is created, update clientSecret
	if (
		checkoutFetcher.data?.success &&
		checkoutFetcher.data.clientSecret &&
		!clientSecret
	) {
		setClientSecret(checkoutFetcher.data.clientSecret);
	}

	// Success state after payment
	if (sessionId && loaderData.transactionStatus === "success") {
		return (
			<div className="space-y-8">
				<DashboardHeader
					title="Supply Depot"
					subtitle="credit_acquisition // confirmed"
					showSearch={false}
				/>

				<div className="max-w-2xl mx-auto glass-panel rounded-xl p-8">
					<div className="text-center space-y-4">
						<div className="text-6xl text-success animate-pulse">✓</div>
						<h2 className="text-2xl font-bold text-carbon">
							Transaction Complete
						</h2>
						<p className="text-sm text-muted">
							Credits have been verified and added to your manifest.
						</p>
						<a
							href="/dashboard"
							className="inline-block mt-6 px-6 py-3 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all"
						>
							Return to Manifest
						</a>
					</div>
				</div>
			</div>
		);
	}

	// Failed verification state
	if (sessionId && loaderData.transactionStatus === "failed") {
		return (
			<div className="space-y-8">
				<DashboardHeader
					title="Supply Depot"
					subtitle="credit_acquisition // error"
					showSearch={false}
				/>

				<div className="max-w-2xl mx-auto bg-danger/10 rounded-xl p-8">
					<div className="text-center space-y-4">
						<div className="text-6xl text-danger">!</div>
						<h2 className="text-2xl font-bold text-danger">
							Verification Failed
						</h2>
						<p className="text-sm text-muted">
							We could not verify your transaction automatically. If you were
							charged, please contact support.
						</p>
						<a
							href="/dashboard/credits"
							className="inline-block mt-6 px-6 py-3 bg-danger/20 text-danger rounded-lg hover:bg-danger/30 transition-all"
						>
							Try Again
						</a>
					</div>
				</div>
			</div>
		);
	}

	// Embedded Checkout view
	if (clientSecret) {
		return (
			<div className="space-y-8">
				<DashboardHeader
					title="Supply Depot"
					subtitle="payment_processing // standby"
					showSearch={false}
				/>

				<div className="max-w-3xl mx-auto glass-panel rounded-xl p-2">
					<EmbeddedCheckoutProvider
						stripe={stripePromise}
						options={{ clientSecret }}
					>
						<EmbeddedCheckout />
					</EmbeddedCheckoutProvider>
				</div>
			</div>
		);
	}

	// Credit pack selection view
	return (
		<div className="space-y-8">
			<DashboardHeader
				title="Supply Depot"
				subtitle="credit_acquisition // online"
				showSearch={false}
			/>

			{/* Current Balance HUD */}
			<div className="max-w-5xl mx-auto glass-panel rounded-xl p-6">
				<div className="flex justify-between items-center">
					<div>
						<div className="text-label text-muted mb-1">Current Balance</div>
						<div className="text-display text-4xl text-carbon tabular-nums">
							{balance.toString().padStart(4, "0")} CR
						</div>
					</div>
					<div className="text-right text-data text-muted space-y-1">
						<div>SCAN COST: 5 CR/operation</div>
						<div>
							REMAINING SCANS: {balance >= 5 ? Math.floor(balance / 5) : 0}
						</div>
					</div>
				</div>
			</div>

			{/* Error Display */}
			{checkoutFetcher.data?.error && (
				<div className="max-w-5xl mx-auto bg-danger/10 rounded-xl p-4 text-danger">
					<div className="text-label mb-1">Error</div>
					<div>{checkoutFetcher.data.error}</div>
				</div>
			)}

			{/* Credit Packs */}
			<div className="max-w-5xl mx-auto">
				<h2 className="text-label text-muted mb-4">Available Supply Packs</h2>

				<div className="grid md:grid-cols-2 gap-6">
					{/* 50 Credits Pack */}
					<button
						type="button"
						onClick={() => handlePurchase("SMALL")}
						disabled={checkoutFetcher.state !== "idle"}
						className="glass-panel rounded-xl p-8 hover:shadow-glow transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group"
					>
						<div className="flex justify-between items-start mb-4">
							<div className="text-label text-muted">Standard Pack</div>
							<div className="text-2xl font-bold text-carbon">€5</div>
						</div>
						<div className="text-5xl font-bold text-carbon mb-2 group-hover:text-hyper-green transition-colors">
							50
						</div>
						<div className="text-label text-muted">Credits</div>
						<div className="mt-4 text-data text-muted">
							≈ 10 scan operations
						</div>
					</button>

					{/* 500 Credits Pack */}
					<button
						type="button"
						onClick={() => handlePurchase("LARGE")}
						disabled={checkoutFetcher.state !== "idle"}
						className="glass-panel rounded-xl p-8 shadow-glow-sm hover:shadow-glow transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group relative"
					>
						<div className="absolute top-4 right-4 text-xs bg-hyper-green text-carbon px-2 py-1 rounded-md font-semibold">
							Best Value
						</div>
						<div className="flex justify-between items-start mb-4">
							<div className="text-label text-muted">Bulk Pack</div>
							<div className="text-2xl font-bold text-carbon">€40</div>
						</div>
						<div className="text-5xl font-bold text-carbon mb-2 group-hover:text-hyper-green transition-colors">
							500
						</div>
						<div className="text-label text-muted">Credits</div>
						<div className="mt-4 text-data text-muted">
							≈ 100 scan operations
						</div>
					</button>
				</div>
			</div>

			{/* Info Panel */}
			<div className="max-w-5xl mx-auto glass-panel rounded-xl p-6">
				<div className="text-label text-muted mb-2">Payment Processing</div>
				<div className="space-y-1 text-sm text-muted">
					<div>• Secure checkout powered by Stripe</div>
					<div>• Credits added instantly upon confirmation</div>
					<div>• All major cards accepted (Visa, Mastercard, Amex)</div>
				</div>
			</div>
		</div>
	);
}
