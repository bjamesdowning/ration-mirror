import { afterEach, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
	waitUntil: vi.fn(),
}));

afterEach(() => {
	vi.restoreAllMocks();
});
