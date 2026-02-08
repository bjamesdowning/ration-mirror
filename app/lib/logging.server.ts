export function redactId(value: string | null | undefined, visible = 4) {
	if (!value) return "redacted";
	if (value.length <= visible * 2) return "redacted";
	return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

export function redactEmail(value: string | null | undefined) {
	if (!value) return "redacted";
	const [local, domain] = value.split("@");
	if (!domain || !local) return "redacted";
	const safeLocal = local.length > 2 ? `${local[0]}***${local.at(-1)}` : "***";
	return `${safeLocal}@${domain}`;
}
