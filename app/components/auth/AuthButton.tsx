import type { ComponentProps } from "react";

interface AuthButtonProps extends ComponentProps<"button"> {
	loading?: boolean;
	error?: string;
	mode: "signIn" | "signUp";
	onAuthClick: () => Promise<void>;
}

export function AuthButton({
	loading = false,
	error,
	mode,
	onAuthClick,
	...props
}: AuthButtonProps) {
	const buttonText =
		mode === "signUp" ? "Sign up with Google" : "Continue with Google";
	const loadingText =
		mode === "signUp" ? "Creating account..." : "Signing in...";

	return (
		<div className="space-y-4">
			{error && (
				<div
					className="bg-danger/10 border border-danger/20 rounded-lg p-3 text-danger text-sm"
					role="alert"
					aria-live="polite"
				>
					{error}
				</div>
			)}

			<button
				type="button"
				onClick={onAuthClick}
				disabled={loading}
				className="w-full bg-hyper-green text-carbon font-bold py-4 px-6 rounded-xl shadow-glow hover:shadow-glow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 focus-ring"
				aria-label={buttonText}
				{...props}
			>
				{loading ? (
					<>
						<span
							className="w-5 h-5 border-2 border-carbon/30 border-t-carbon rounded-full animate-spin"
							aria-hidden="true"
						/>
						{loadingText}
					</>
				) : (
					<>
						<svg
							viewBox="0 0 24 24"
							className="w-5 h-5 fill-current"
							xmlns="http://www.w3.org/2000/svg"
							role="img"
							aria-label="Google logo"
						>
							<title>Google Logo</title>
							<path d="M12.48 10.92v3.28h7.84c-.24 1.84-.908 3.152-1.928 4.176-1.288 1.288-3.232 2.768-6.192 2.768-4.744 0-8.432-3.832-8.432-8.576s3.688-8.576 8.432-8.576c2.56 0 4.416.992 5.8 2.312l2.312-2.312C18.152 2.032 15.544.928 12.48.928c-6.136 0-11.232 4.968-11.232 11.104s5.096 11.104 11.232 11.104c3.312 0 5.8-1.088 7.792-3.152 2.056-2.056 2.712-4.904 2.712-7.232 0-.696-.056-1.352-.16-1.928h-8.064z" />
						</svg>
						{buttonText}
					</>
				)}
			</button>
		</div>
	);
}
