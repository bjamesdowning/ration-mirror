/** Person's Apple Health switch. Flag off, or a failed read, is off. */
export async function healthExportPreferenceEnabled(): Promise<boolean> {
	try {
		const response = await fetch("/api/nutrition/health-export", {
			credentials: "same-origin",
		});
		if (!response.ok) return false;
		const body = (await response.json()) as { enabled?: boolean };
		return body.enabled === true;
	} catch {
		return false;
	}
}
