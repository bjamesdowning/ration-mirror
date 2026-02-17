import {
	EmbeddedCheckout,
	EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useState } from "react";
import { useFetcher } from "react-router";

interface CreditShopProps {
	stripePublishableKey: string;
	returnUrl?: string; // e.g. "/dashboard/settings"
}

export function CreditShop({
	stripePublishableKey,
	returnUrl = "/dashboard/settings",
}: CreditShopProps) {
	const checkoutFetcher = useFetcher<{
		success: boolean;
		clientSecret: string;
		error?: string;
	}>();
	const [clientSecret, setClientSecret] = useState<string | null>(null);

	// Initialize Stripe
	const stripePromise = loadStripe(stripePublishableKey);

	const handlePurchase = async (
		packKey:
			| "TASTE_TEST"
			| "SUPPLY_RUN"
			| "MISSION_CRATE"
			| "ORBITAL_STOCKPILE",
	) => {
		const formData = new FormData();
		formData.append("type", "credits");
		formData.append("pack", packKey);
		formData.append("returnUrl", returnUrl);

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

	// Embedded Checkout view
	if (clientSecret) {
		return (
			<div className="space-y-4">
				<div className="flex justify-between items-center">
					<h2 className="text-xl font-bold text-carbon">Complete Purchase</h2>
					<button
						type="button"
						onClick={() => setClientSecret(null)}
						className="text-sm text-muted hover:text-carbon underline"
					>
						Cancel
					</button>
				</div>
				<div className="glass-panel rounded-xl p-2 min-h-[400px]">
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

	return (
		<div className="space-y-6">
			{/* Error Display */}
			{checkoutFetcher.data?.error && (
				<div className="bg-danger/10 rounded-xl p-4 text-danger animate-in slide-in-from-top-2">
					<div className="text-label mb-1">Error</div>
					<div>{checkoutFetcher.data.error}</div>
				</div>
			)}

			<div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
				<button
					type="button"
					onClick={() => handlePurchase("TASTE_TEST")}
					disabled={checkoutFetcher.state !== "idle"}
					className="glass-panel rounded-xl p-6 hover:shadow-glow transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
				>
					<div className="absolute inset-0 bg-gradient-to-br from-transparent to-platinum/10 opacity-0 group-hover:opacity-100 transition-opacity" />
					<div className="relative z-10">
						<div className="flex justify-between items-start mb-4">
							<div className="text-label text-muted">Taste Test</div>
							<div className="text-2xl font-bold text-carbon">€0.99</div>
						</div>
						<div className="text-5xl font-bold text-carbon mb-2 group-hover:text-hyper-green transition-colors">
							15
						</div>
						<div className="text-label text-muted">Credits</div>
						<div className="mt-4 text-data text-muted">
							≈ 7 scans or generations
						</div>
					</div>
				</button>

				<button
					type="button"
					onClick={() => handlePurchase("SUPPLY_RUN")}
					disabled={checkoutFetcher.state !== "idle"}
					className="glass-panel rounded-xl p-6 hover:shadow-glow transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
				>
					<div className="absolute inset-0 bg-gradient-to-br from-transparent to-hyper-green/5 opacity-0 group-hover:opacity-100 transition-opacity" />
					<div className="absolute top-4 right-4 text-xs bg-hyper-green text-carbon px-2 py-1 rounded-md font-semibold z-20">
						Best Value
					</div>
					<div className="relative z-10">
						<div className="flex justify-between items-start mb-4">
							<div className="text-label text-muted">Supply Run</div>
							<div className="text-2xl font-bold text-carbon">€4.99</div>
						</div>
						<div className="text-5xl font-bold text-carbon mb-2 group-hover:text-hyper-green transition-colors">
							60
						</div>
						<div className="text-label text-muted">Credits</div>
						<div className="mt-4 text-data text-muted">
							≈ 30 scans or generations
						</div>
					</div>
				</button>

				<button
					type="button"
					onClick={() => handlePurchase("MISSION_CRATE")}
					disabled={checkoutFetcher.state !== "idle"}
					className="glass-panel rounded-xl p-6 hover:shadow-glow transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
				>
					<div className="relative z-10">
						<div className="flex justify-between items-start mb-4">
							<div className="text-label text-muted">Mission Crate</div>
							<div className="text-2xl font-bold text-carbon">€9.99</div>
						</div>
						<div className="text-5xl font-bold text-carbon mb-2 group-hover:text-hyper-green transition-colors">
							150
						</div>
						<div className="text-label text-muted">Credits</div>
						<div className="mt-4 text-data text-muted">
							≈ 75 scans or generations
						</div>
					</div>
				</button>

				<button
					type="button"
					onClick={() => handlePurchase("ORBITAL_STOCKPILE")}
					disabled={checkoutFetcher.state !== "idle"}
					className="glass-panel rounded-xl p-6 hover:shadow-glow transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
				>
					<div className="relative z-10">
						<div className="flex justify-between items-start mb-4">
							<div className="text-label text-muted">Orbital Stockpile</div>
							<div className="text-2xl font-bold text-carbon">€24.99</div>
						</div>
						<div className="text-5xl font-bold text-carbon mb-2 group-hover:text-hyper-green transition-colors">
							500
						</div>
						<div className="text-label text-muted">Credits</div>
						<div className="mt-4 text-data text-muted">
							≈ 250 scans or generations
						</div>
					</div>
				</button>
			</div>

			<div className="flex items-center gap-2 text-xs text-muted justify-center">
				<span>Secure checkout via Stripe</span>
				<span>•</span>
				<span>Instant credit delivery</span>
			</div>
		</div>
	);
}
