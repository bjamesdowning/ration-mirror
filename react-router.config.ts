import type { Config } from "@react-router/dev/config";

export default {
	ssr: true,
	// Stay on v7 behavior. These flags become default in v8; do not adopt them
	// in the 7.18.4 security bump. Setting them false also silences 7.16 warnings.
	future: {
		v8_middleware: false,
		v8_splitRouteModules: false,
		v8_viteEnvironmentApi: false,
		v8_passThroughRequests: false,
		v8_trailingSlashAwareDataRequests: false,
	},
} satisfies Config;
