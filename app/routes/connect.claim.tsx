import { useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { OAuthCard } from "~/components/oauth/OAuthCard";

type ClaimResponse = {
	ok?: boolean;
	stage?: "otp_sent" | "claim_complete";
	error?: string;
};

export default function ConnectClaimPage() {
	const [searchParams] = useSearchParams();
	const [claimToken, setClaimToken] = useState(searchParams.get("token") ?? "");
	const fetcher = useFetcher<ClaimResponse>();
	const [email, setEmail] = useState("");
	const [otp, setOtp] = useState("");
	const [otpSent, setOtpSent] = useState(false);

	const isSubmitting = fetcher.state !== "idle";

	function handleSendOtp(e: React.FormEvent) {
		e.preventDefault();
		if (!claimToken) return;
		fetcher.submit(JSON.stringify({ claim_token: claimToken, email }), {
			method: "POST",
			action: "/api/agent/auth/claim",
			encType: "application/json",
		});
		setOtpSent(true);
	}

	function handleComplete(e: React.FormEvent) {
		e.preventDefault();
		if (!claimToken) return;
		fetcher.submit(JSON.stringify({ claim_token: claimToken, email, otp }), {
			method: "POST",
			action: "/api/agent/auth/claim/complete",
			encType: "application/json",
		});
	}

	const claimComplete =
		fetcher.data?.ok === true && fetcher.data.stage === "claim_complete";

	return (
		<OAuthCard maxWidth="md" title="Claim agent kitchen">
			{claimComplete ? (
				<div className="text-center space-y-4">
					<p className="text-lg font-mono font-bold text-hyper-green">
						Kitchen claimed
					</p>
					<p className="text-sm text-muted">
						Your agent now has full write access. You can sign in to manage your
						kitchen in the hub.
					</p>
					<a
						href="/hub"
						className="inline-block px-6 py-3 rounded-xl bg-hyper-green text-carbon font-mono font-bold text-sm"
					>
						Open Hub →
					</a>
				</div>
			) : (
				<div className="space-y-6">
					<p className="text-sm text-muted">
						Verify your email to link this agent kitchen to your account and
						unlock write access.
					</p>
					<label className="block">
						<span className="text-xs text-label text-muted">Claim token</span>
						<input
							type="text"
							required
							value={claimToken}
							onChange={(e) => setClaimToken(e.target.value)}
							className="mt-1 w-full rounded-xl border border-platinum bg-ceramic px-4 py-3 font-mono text-sm text-carbon focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
							placeholder="Paste claim token"
						/>
					</label>

					{!otpSent ? (
						<form onSubmit={handleSendOtp} className="space-y-4">
							<label className="block">
								<span className="text-xs text-label text-muted">Email</span>
								<input
									type="email"
									required
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									className="mt-1 w-full rounded-xl border border-platinum bg-ceramic px-4 py-3 font-mono text-sm text-carbon focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
									placeholder="you@example.com"
								/>
							</label>
							<button
								type="submit"
								disabled={isSubmitting}
								className="w-full rounded-xl bg-hyper-green py-3 font-mono font-bold text-carbon text-sm disabled:opacity-50"
							>
								Send verification code
							</button>
						</form>
					) : (
						<form onSubmit={handleComplete} className="space-y-4">
							<p className="text-sm text-carbon">
								Code sent to <strong>{email}</strong>
							</p>
							<label className="block">
								<span className="text-xs text-label text-muted">
									6-digit code
								</span>
								<input
									type="text"
									inputMode="numeric"
									pattern="\d{6}"
									maxLength={6}
									required
									value={otp}
									onChange={(e) => setOtp(e.target.value)}
									className="mt-1 w-full rounded-xl border border-platinum bg-ceramic px-4 py-3 font-mono text-lg tracking-widest text-carbon text-center focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
									placeholder="000000"
								/>
							</label>
							{fetcher.data?.error ? (
								<p className="text-sm text-red-600">{fetcher.data.error}</p>
							) : null}
							<button
								type="submit"
								disabled={isSubmitting}
								className="w-full rounded-xl bg-hyper-green py-3 font-mono font-bold text-carbon text-sm disabled:opacity-50"
							>
								Verify and claim
							</button>
							<button
								type="button"
								onClick={() => setOtpSent(false)}
								className="w-full text-sm text-muted hover:text-carbon"
							>
								Use a different email
							</button>
						</form>
					)}
				</div>
			)}
		</OAuthCard>
	);
}
