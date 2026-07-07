import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		globals: true,
		environment: "node",
		include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
		setupFiles: ["app/test/helpers/setup.ts"],
		testTimeout: 10000,
		reporters: process.env.CI
			? ["default", ["junit", { suiteName: "Ration unit" }]]
			: ["default"],
		outputFile: {
			junit: "./reports/junit.xml",
		},
		coverage: {
			provider: "v8",
			reporter: ["text", "cobertura", "html"],
			include: ["app/lib/**/*.ts"],
			exclude: [
				"app/lib/**/*.server.ts",
				"app/lib/schemas/**",
				"app/lib/types.ts",
				"app/lib/auth-client.ts",
				"app/lib/logging.client.ts",
			],
			thresholds: {
				statements: 70,
				branches: 60,
				functions: 70,
				lines: 70,
			},
		},
	},
});
