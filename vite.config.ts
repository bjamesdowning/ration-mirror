import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ isSsrBuild }) => ({
	plugins: [
		cloudflare({ viteEnvironment: { name: "server" } }),
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
				}
			: undefined,
	},
}));
