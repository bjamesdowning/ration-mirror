import { afterEach, describe, expect, it, vi } from "vitest";
import {
	log,
	redactEmail,
	redactId,
	redactJobRequestId,
} from "../logging.server";
import { fetchLogContext, runWithOpsEnv } from "../ops-context.server";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("redactId / redactEmail", () => {
	it("redacts long ids to first/last 4 chars", () => {
		expect(redactId("abcdefghijklmnop")).toBe("abcd...mnop");
	});

	it("redacts short ids entirely", () => {
		expect(redactId("abc")).toBe("redacted");
		expect(redactId(null)).toBe("redacted");
	});

	it("masks email local-part", () => {
		expect(redactEmail("ada@example.com")).toBe("a***a@example.com");
		expect(redactEmail("not-an-email")).toBe("redacted");
	});
});

describe("redactJobRequestId", () => {
	it("redacts requestId from a queue body", () => {
		expect(
			redactJobRequestId({ requestId: "req_scan_abcdefghijklmnopqrst" }),
		).toBe("req_...qrst");
	});

	it("returns undefined when requestId is missing", () => {
		expect(redactJobRequestId({})).toBeUndefined();
		expect(redactJobRequestId(null)).toBeUndefined();
		expect(redactJobRequestId("scan")).toBeUndefined();
	});
});

describe("log JSON emit", () => {
	it("emits an object with level and msg on info", () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		log.info("mcp_audit", { event: "mcp_audit", tool: "add_cargo" });
		expect(info).toHaveBeenCalledTimes(1);
		const payload = info.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(payload).toEqual({
			level: "info",
			msg: "mcp_audit",
			event: "mcp_audit",
			tool: "add_cargo",
		});
		expect(typeof payload).toBe("object");
		expect(typeof payload.msg).toBe("string");
	});

	it("uses console.error for error and critical", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		log.error("boom", new Error("d1 busy"), { event: "queue_consumer_error" });
		log.critical("schema", new Error("no such table"));
		expect(error).toHaveBeenCalledTimes(2);
		const first = error.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(first.level).toBe("error");
		expect(first.msg).toBe("boom");
		expect(first.event).toBe("queue_consumer_error");
		expect(String(first.err)).toContain("d1 busy");
		expect(first.err).not.toBeInstanceOf(Error);
		const second = error.mock.calls[1]?.[0] as Record<string, unknown>;
		expect(second.level).toBe("critical");
	});

	it("uses console.warn for warnings", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		log.warn("Unknown queue", { queue: "ration-unknown" });
		expect(warn).toHaveBeenCalledWith({
			level: "warn",
			msg: "Unknown queue",
			queue: "ration-unknown",
		});
	});

	it("merges ALS log context without overwriting caller event", () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		runWithOpsEnv(
			{
				CF_VERSION_METADATA: {
					id: "ver-1234567890ab",
					tag: "1.9.7",
					timestamp: "2026-08-15T00:00:00Z",
				},
			},
			() => {
				log.info("oauth_flow", { event: "oauth_flow" });
			},
			{
				handler: "fetch",
				worker: "ration",
				cfRay: "ray-abc",
			},
		);
		expect(info).toHaveBeenCalledWith({
			level: "info",
			msg: "oauth_flow",
			handler: "fetch",
			worker: "ration",
			cfRay: "ray-abc",
			versionId: "ver-1234567890ab",
			versionTag: "1.9.7",
			event: "oauth_flow",
		});
	});

	it("fetchLogContext copies cf-ray without inventing a request id header", () => {
		const request = new Request("https://ration.mayutic.com/hub", {
			headers: { "cf-ray": "abc123def" },
		});
		expect(fetchLogContext(request, "ration")).toEqual({
			handler: "fetch",
			worker: "ration",
			cfRay: "abc123def",
		});
	});

	it("treats a plain object as context when passed as the second argument", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		log.error("[Auth] Failed to send magic link email", {
			message: "provider down",
		});
		expect(error).toHaveBeenCalledWith({
			level: "error",
			msg: "[Auth] Failed to send magic link email",
			message: "provider down",
		});
		const payload = error.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(payload).not.toHaveProperty("err");
	});

	it("still serializes an Error passed as the second argument", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		log.error("Queue consumer error", new Error("d1 busy"));
		const payload = error.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(payload.level).toBe("error");
		expect(String(payload.err)).toContain("d1 busy");
		expect(payload).not.toHaveProperty("message");
	});

	it("does not put secrets, emails, or raw Error objects on the payload", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const err = new Error("query failed");
		log.error("failed", err, { queue: "ration-scan" });
		const payload = error.mock.calls[0]?.[0] as Record<string, unknown>;
		const serialized = JSON.stringify(payload);
		expect(serialized).not.toMatch(/Bearer /);
		expect(serialized).not.toMatch(/sk_/);
		expect(serialized).not.toMatch(/@example\.com/);
		expect(payload.err).not.toBe(err);
		expect(payload).not.toHaveProperty("authorization");
		expect(payload).not.toHaveProperty("email");
	});
});
