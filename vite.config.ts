import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const cloudflareEnv = process.env.CLOUDFLARE_ENV;
const configPath =
	cloudflareEnv === "local"
		? "./wrangler.local.jsonc"
		: cloudflareEnv === "dev"
			? "./wrangler.dev.jsonc"
			: undefined;

export default defineConfig(({ isSsrBuild }) => ({
	plugins: [
		cloudflare({
			viteEnvironment: { name: "server" },
			...(configPath && { configPath }),
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
