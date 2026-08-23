import { describe, expect, it } from "vitest";
import { shouldAdminRevalidate } from "../admin-revalidate";

describe("shouldAdminRevalidate", () => {
	it("skips the dashboard loader after Grant Admin", () => {
		const formData = new FormData();
		formData.set("intent", "toggle-admin");
		formData.set("userId", "user_1");
		expect(
			shouldAdminRevalidate({
				formMethod: "POST",
				formAction: "/admin",
				formData,
				defaultShouldRevalidate: true,
			}),
		).toBe(false);
	});

	it("skips the dashboard loader after Delete account", () => {
		const formData = new FormData();
		formData.set("intent", "delete-account");
		formData.set("userId", "user_1");
		formData.set("confirmEmail", "alice@test.com");
		expect(
			shouldAdminRevalidate({
				formMethod: "POST",
				formAction: "/admin",
				formData,
				defaultShouldRevalidate: true,
			}),
		).toBe(false);
	});

	it("revalidates failed-purge retry so the job list refreshes", () => {
		const formData = new FormData();
		formData.set("intent", "retry-purge-job");
		expect(
			shouldAdminRevalidate({
				formMethod: "POST",
				formAction: "/admin",
				formData,
				defaultShouldRevalidate: true,
			}),
		).toBe(true);
	});

	it("does not revalidate GET navigation", () => {
		expect(
			shouldAdminRevalidate({
				formMethod: "GET",
				defaultShouldRevalidate: true,
			}),
		).toBe(false);
	});
});
