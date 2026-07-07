/**
 * Minimal service worker — caches the app shell for faster repeat visits.
 * Does not cache API responses or provide offline data access.
 */
const CACHE_NAME = "ration-shell-v1";
const SHELL_URLS = ["/", "/hub", "/static/ration-logo.svg"];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)),
	);
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
				),
			),
	);
	self.clients.claim();
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname.startsWith("/api/")) return;

	if (request.mode === "navigate") {
		const fallbackUrl = url.pathname.startsWith("/hub") ? "/hub" : "/";
		event.respondWith(
			fetch(request).catch(
				async () => (await caches.match(fallbackUrl)) ?? Response.error(),
			),
		);
		return;
	}

	if (
		url.pathname.startsWith("/static/") ||
		url.pathname === "/manifest.webmanifest"
	) {
		event.respondWith(
			caches.match(request).then((cached) => cached ?? fetch(request)),
		);
	}
});
