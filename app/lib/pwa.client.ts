/** Register the minimal app-shell service worker (production hub only). */
export function registerServiceWorker(): void {
	if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
	if (import.meta.env.DEV) return;

	window.addEventListener("load", () => {
		navigator.serviceWorker.register("/sw.js").catch(() => {
			// Non-fatal — PWA install still works via manifest
		});
	});
}
