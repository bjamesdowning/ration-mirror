import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const isRemoteDev = process.env.CLOUDFLARE_ENV === "dev";

export default defineConfig(({ isSsrBuild }) => ({
	plugins: [
		cloudflare({
			viteEnvironment: { name: "server" },
			...(isRemoteDev && { configPath: "./wrangler.dev.jsonc" }),
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
