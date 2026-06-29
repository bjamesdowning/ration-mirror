import { Download, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const DISMISS_KEY = "ration:pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIosSafari(): boolean {
	if (typeof navigator === "undefined") return false;
	const ua = navigator.userAgent;
	return (
		/iPad|iPhone|iPod/.test(ua) &&
		!(window as Window & { MSStream?: unknown }).MSStream
	);
}

export function PwaInstallPrompt() {
	const [deferredPrompt, setDeferredPrompt] =
		useState<BeforeInstallPromptEvent | null>(null);
	const [showIosHint, setShowIosHint] = useState(false);
	const [hidden, setHidden] = useState(true);

	useEffect(() => {
		if (typeof window === "undefined") return;
		if (localStorage.getItem(DISMISS_KEY) === "1") return;
		if (window.matchMedia("(display-mode: standalone)").matches) return;

		const onBeforeInstall = (e: Event) => {
			e.preventDefault();
			setDeferredPrompt(e as BeforeInstallPromptEvent);
			setHidden(false);
		};

		window.addEventListener("beforeinstallprompt", onBeforeInstall);

		if (isIosSafari()) {
			setShowIosHint(true);
			setHidden(false);
		}

		return () => {
			window.removeEventListener("beforeinstallprompt", onBeforeInstall);
		};
	}, []);

	const dismiss = useCallback(() => {
		localStorage.setItem(DISMISS_KEY, "1");
		setHidden(true);
	}, []);

	const install = useCallback(async () => {
		if (!deferredPrompt) return;
		await deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		if (outcome === "accepted") dismiss();
		setDeferredPrompt(null);
	}, [deferredPrompt, dismiss]);

	if (hidden) return null;

	return (
		<div className="fixed bottom-24 left-4 right-4 z-40 md:hidden safe-area-pb">
			<div className="glass-panel rounded-xl p-4 shadow-lg border border-platinum flex items-start gap-3">
				<div className="flex-1 min-w-0">
					<p className="text-sm font-bold text-carbon">Install Ration</p>
					<p className="text-xs text-muted mt-1">
						{showIosHint && !deferredPrompt
							? "Tap Share, then Add to Home Screen for quick access."
							: "Add Ration to your home screen for a faster launch."}
					</p>
				</div>
				<div className="flex items-center gap-1 shrink-0">
					{deferredPrompt ? (
						<button
							type="button"
							onClick={install}
							className="p-2 rounded-lg bg-hyper-green text-carbon"
							aria-label="Install app"
						>
							<Download className="w-4 h-4" />
						</button>
					) : null}
					<button
						type="button"
						onClick={dismiss}
						className="p-2 rounded-lg text-muted hover:text-carbon"
						aria-label="Dismiss install prompt"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			</div>
		</div>
	);
}
