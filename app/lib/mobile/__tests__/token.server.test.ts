import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
	MOBILE_ACCESS_TTL_SEC,
	MOBILE_JWT_AUDIENCE,
} from "~/lib/mobile/constants";
import { verifyMobileAccessToken } from "~/lib/mobile/token.server";
import { RATION_ORG_CLAIM } from "~/lib/oauth.constants";
import { createMockEnv } from "~/test/helpers/mock-env";

describe("mobile token server", () => {
	const secret = "test-mobile-auth-secret-32chars!!";

	it("verifies access token signed with BETTER_AUTH_SECRET", async () => {
		const env = createMockEnv();
		env.BETTER_AUTH_SECRET = secret;

		const token = await new SignJWT({
			[RATION_ORG_CLAIM]: "org-1",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setSubject("user-1")
			.setAudience(MOBILE_JWT_AUDIENCE)
			.setIssuedAt()
			.setExpirationTime(`${MOBILE_ACCESS_TTL_SEC}s`)
			.sign(new TextEncoder().encode(secret));

		const claims = await verifyMobileAccessToken(env, token);
		expect(claims).toEqual({ userId: "user-1", organizationId: "org-1" });
	});

	it("rejects token signed with wrong secret", async () => {
		const env = createMockEnv();
		env.BETTER_AUTH_SECRET = secret;

		const token = await new SignJWT({
			[RATION_ORG_CLAIM]: "org-1",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setSubject("user-1")
			.setAudience(MOBILE_JWT_AUDIENCE)
			.setExpirationTime("5m")
			.sign(new TextEncoder().encode("wrong-secret-wrong-secret-wrong!!"));

		await expect(verifyMobileAccessToken(env, token)).rejects.toThrow();
	});
});
