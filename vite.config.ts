import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// RATION_DEV_MODE selects the wrangler config file. Do not set CLOUDFLARE_ENV=local —
// the vite-plugin maps CLOUDFLARE_ENV to wrangler --env, which requires env.* sections.
const devMode = process.env.RATION_DEV_MODE ?? process.env.CLOUDFLARE_ENV;
const configPath =
	devMode === "local"
		? "./wrangler.local.jsonc"
		: devMode === "dev"
			? "./wrangler.dev.jsonc"
			: undefined;

// Prebundle the deps a blog post and the pricing page discover on first visit.
// The client optimizer and the Cloudflare server environment keep separate
// caches. A mid-boot server optimize reloads the worker, and a reload that
// still points at the previous chunk hash exits the dev server.
const devOptimizeDeps = [
	"lucide-react",
	"zod",
	"better-auth/client/plugins",
	"better-auth/crypto",
	"better-auth/react",
	"react",
	"react-dom",
	"react-dom/server",
	"react/jsx-dev-runtime",
	"isbot",
	"gray-matter",
	"zod-to-json-schema",
	"react-markdown",
	"remark-gfm",
	"react-syntax-highlighter",
	"react-syntax-highlighter/dist/cjs/styles/hljs",
	"mermaid",
	"@stripe/react-stripe-js",
	"@stripe/stripe-js",
];

export default defineConfig(({ isSsrBuild }) => ({
	optimizeDeps: {
		include: devOptimizeDeps,
	},
	environments: {
		server: {
			optimizeDeps: {
				include: devOptimizeDeps,
			},
		},
	},
	plugins: [
		cloudflare({
			viteEnvironment: { name: "server" },
			...(configPath && { configPath }),
			// Local E2E uses Miniflare only — AI/Vectorize are not available without
			// a Cloudflare edge-preview proxy (see workers/subdomain/edge-preview).
			...(devMode === "local" && { remoteBindings: false }),
		}),
		reactRouter(),
		tailwindcss(),
		tsconfigPaths(),
	],
	ssr: {
		target: "webworker",
		noExternal: true,
	},
	build: {
		outDir: "build",
		rollupOptions: isSsrBuild
			? {
					input: "./workers/app.ts",
					// cloudflare:workers is a runtime-only virtual module provided by
					// the Workers runtime. It cannot be bundled by Rollup and must be
					// declared external so the SSR build leaves it as a bare import.
					external: ["cloudflare:workers"],
				}
			: undefined,
	},
}));
