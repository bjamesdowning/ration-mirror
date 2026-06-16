import { useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { OAuthCard } from "~/components/oauth/OAuthCard";
import { CURRENT_TOS_VERSION } from "~/lib/tos.constants";

type ClaimResponse = {
	ok?: boolean;
	stage?: "otp_sent" | "claim_complete";
	error?: string;
};

type ReissueResponse = {
	claim_token?: string;
	claim_url?: string;
	claim_token_expires_at?: string;
	error?: string;
};

export default function ConnectClaimPage() {
	const [searchParams] = useSearchParams();
	const [claimToken, setClaimToken] = useState(searchParams.get("token") ?? "");
	const fetcher = useFetcher<ClaimResponse>();
	const [email, setEmail] = useState("");
	const [otp, setOtp] = useState("");
	const [otpSent, setOtpSent] = useState(false);
	const [tosAccepted, setTosAccepted] = useState(false);
	const [showReissue, setShowReissue] = useState(false);
	const [apiKey, setApiKey] = useState("");
	const [reissuedUrl, setReissuedUrl] = useState<string | null>(null);
	const [reissueError, setReissueError] = useState<string | null>(null);
	const [isReissuing, setIsReissuing] = useState(false);

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
		if (!claimToken || !tosAccepted) return;
		fetcher.submit(
			JSON.stringify({
				claim_token: claimToken,
				email,
				otp,
				tos_accepted: true,
				tos_version: CURRENT_TOS_VERSION,
			}),
			{
				method: "POST",
				action: "/api/agent/auth/claim/complete",
				encType: "application/json",
			},
		);
	}

	async function handleReissue(e: React.FormEvent) {
		e.preventDefault();
		if (!apiKey) return;
		setIsReissuing(true);
		setReissueError(null);
		try {
			const response = await fetch("/api/agent/auth/claim/reissue", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey.trim()}`,
				},
			});
			const data = (await response.json()) as ReissueResponse;
			if (!response.ok) {
				setReissueError(data.error ?? "Reissue failed");
				return;
			}
			if (data.claim_url) {
				setReissuedUrl(data.claim_url);
			}
			if (data.claim_token) {
				setClaimToken(data.claim_token);
			}
		} catch {
			setReissueError("Reissue failed");
		} finally {
			setIsReissuing(false);
		}
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
						Your agent kitchen is now linked to your account. Sign in to manage
						it in the hub.
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
						Verify your email to link this agent kitchen to your account.
						Claiming transfers ownership — it does not unlock additional API
						scopes or tier capacity.
					</p>

					{!showReissue ? (
						<button
							type="button"
							onClick={() => setShowReissue(true)}
							className="text-sm text-hyper-green hover:underline font-mono"
						>
							Lost your claim link?
						</button>
					) : (
						<div className="rounded-xl border border-platinum bg-ceramic/50 p-4 space-y-3">
							<p className="text-sm text-carbon font-mono font-bold">
								Recover claim link
							</p>
							<p className="text-xs text-muted">
								Paste your agent API key to receive a new claim URL. This
								invalidates any previous claim token.
							</p>
							<form onSubmit={handleReissue} className="space-y-3">
								<label className="block">
									<span className="text-xs text-label text-muted">
										Agent API key
									</span>
									<input
										type="password"
										required
										value={apiKey}
										onChange={(e) => setApiKey(e.target.value)}
										className="mt-1 w-full rounded-xl border border-platinum bg-ceramic px-4 py-3 font-mono text-sm text-carbon focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
										placeholder="rtn_live_..."
										autoComplete="off"
									/>
								</label>
								{reissueError ? (
									<p className="text-sm text-red-600">{reissueError}</p>
								) : null}
								{reissuedUrl ? (
									<p className="text-sm text-hyper-green break-all">
										New claim URL ready — token field updated below.
									</p>
								) : null}
								<button
									type="submit"
									disabled={isReissuing}
									className="w-full rounded-xl border border-hyper-green py-2 font-mono font-bold text-hyper-green text-sm disabled:opacity-50"
								>
									Reissue claim link
								</button>
							</form>
						</div>
					)}

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
							<label className="flex items-start gap-3 cursor-pointer">
								<input
									type="checkbox"
									required
									checked={tosAccepted}
									onChange={(e) => setTosAccepted(e.target.checked)}
									className="mt-1 rounded border-platinum text-hyper-green focus:ring-hyper-green/50"
								/>
								<span className="text-sm text-carbon">
									I accept the{" "}
									<a
										href="/legal/terms"
										target="_blank"
										rel="noopener noreferrer"
										className="text-hyper-green underline"
									>
										Terms of Service
									</a>{" "}
									(version {CURRENT_TOS_VERSION})
								</span>
							</label>
							{fetcher.data?.error ? (
								<p className="text-sm text-red-600">{fetcher.data.error}</p>
							) : null}
							<button
								type="submit"
								disabled={isSubmitting || !tosAccepted}
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
