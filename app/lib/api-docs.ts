/** v1 API endpoint metadata for documentation and tooling. */

export interface V1Endpoint {
	path: string;
	method: "GET" | "POST";
	scope: "inventory" | "galley" | "supply";
	format: "CSV" | "JSON";
	description?: string;
}

export const V1_ENDPOINTS: V1Endpoint[] = [
	{
		path: "/api/v1/inventory/export",
		method: "GET",
		scope: "inventory",
		format: "CSV",
	},
	{
		path: "/api/v1/inventory/import",
		method: "POST",
		scope: "inventory",
		format: "CSV",
	},
	{
		path: "/api/v1/galley/export",
		method: "GET",
		scope: "galley",
		format: "JSON",
	},
	{
		path: "/api/v1/galley/import",
		method: "POST",
		scope: "galley",
		format: "JSON",
	},
	{
		path: "/api/v1/supply/export",
		method: "GET",
		scope: "supply",
		format: "CSV",
	},
];

export const API_RATE_LIMITS = {
	export: "30 requests/minute",
	import: "20 requests/minute",
} as const;
