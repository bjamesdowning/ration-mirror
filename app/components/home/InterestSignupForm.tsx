import { useState } from "react";
import { Link } from "react-router";

type Status = "idle" | "loading" | "success" | "already" | "error";

export function InterestSignupForm() {
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState<Status>("idle");
	const [errorMessage, setErrorMessage] = useState("");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email.trim()) return;

		setStatus("loading");
		setErrorMessage("");

		try {
			const res = await fetch("/api/interest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: email.trim(), source: "home" }),
			});

			const data = (await res.json().catch(() => ({}))) as {
				error?: string;
				alreadyRegistered?: boolean;
			};

			if (!res.ok) {
				setStatus("error");
				setErrorMessage(
					data?.error ?? "Something went wrong. Please try again.",
				);
				return;
			}

			setStatus(data.alreadyRegistered ? "already" : "success");
			if (!data.alreadyRegistered) setEmail("");
		} catch {
			setStatus("error");
			setErrorMessage("Something went wrong. Please try again.");
		}
	};

	return (
		<div className="w-full max-w-md mx-auto">
			<div className="glass-panel rounded-xl p-5 border border-hyper-green/20">
				<h3 className="text-display text-sm font-semibold text-carbon mb-3">
					Get notified when we launch
				</h3>
				{status === "success" ? (
					<p className="text-sm text-hyper-green font-medium">
						You're on the list. We'll be in touch.
					</p>
				) : status === "already" ? (
					<p className="text-sm text-hyper-green font-medium">
						You're already on the list. We'll be in touch.
					</p>
				) : (
					<form onSubmit={handleSubmit} className="space-y-3">
						<div className="flex gap-2">
							<input
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="your@email.com"
								disabled={status === "loading"}
								className="flex-1 px-3 py-2 rounded-lg border border-carbon/20 bg-ceramic text-carbon text-sm font-mono placeholder:text-carbon/40 focus:outline-none focus:ring-2 focus:ring-hyper-green/50 focus:border-hyper-green"
								required
								aria-label="Email address"
							/>
							<button
								type="submit"
								disabled={status === "loading"}
								className="px-4 py-2 rounded-lg bg-hyper-green text-carbon font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
							>
								{status === "loading" ? "..." : "Notify me"}
							</button>
						</div>
						{status === "error" && errorMessage && (
							<p className="text-xs text-red-600">{errorMessage}</p>
						)}
					</form>
				)}
				<p className="text-[11px] text-muted mt-3 leading-relaxed">
					By signing up, you agree to receive launch updates. We won't spam you.{" "}
					<Link
						to="/legal/privacy"
						className="text-hyper-green hover:underline"
					>
						Privacy Policy
					</Link>
					.
				</p>
			</div>
		</div>
	);
}
