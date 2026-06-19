import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAgentStubEmail } from "~/lib/agent/stub-user";
import type { ReengagementCandidate } from "~/lib/reengagement-cron.server";
import {
	findReengagementEmailCandidates,
	MAX_REENGAGEMENT_EMAILS_PER_RUN,
	sendReengagementEmails,
} from "~/lib/reengagement-cron.server";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockFindFirst = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		select: mockSelect,
		query: {
			user: {
				findFirst: mockFindFirst,
			},
		},
		update: () => ({
			set: mockUpdateSet,
		}),
	}),
}));

const mockSendEmail = vi.fn();
vi.mock("~/lib/email.server", () => ({
	buildReengagementEmail: vi.fn(() => ({
		subject: "Time to check your orbital pantry",
		html: "<p>Return</p>",
		text: "Return",
	})),
	sendEmail: (...args: unknown[]) => mockSendEmail(...args),
	shouldSkipEmailSend: vi.fn(() => false),
}));

const NOW = new Date("2026-06-19T12:00:00.000Z");
const INACTIVE_MS = 31 * 24 * 60 * 60 * 1000;

function makeCandidate(
	overrides: Partial<ReengagementCandidate> = {},
): ReengagementCandidate {
	return {
		id: "user-1",
		email: "billy@example.com",
		name: "Billy Downing",
		settings: null,
		createdAt: new Date(NOW.getTime() - INACTIVE_MS),
		sessionUpdatedAt: new Date(NOW.getTime() - INACTIVE_MS),
		apiKeyLastUsedAt: null,
		...overrides,
	};
}

describe("reengagement-cron.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSelect.mockReturnValue({ from: mockFrom });
		mockFrom.mockReturnValue({ where: mockWhere });
		mockWhere.mockReturnValue({ orderBy: mockOrderBy });
		mockOrderBy.mockReturnValue({ limit: mockLimit });
		mockLimit.mockResolvedValue([]);
		mockFindFirst.mockResolvedValue({ settings: {} });
		mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
		mockUpdateWhere.mockResolvedValue(undefined);
		mockSendEmail.mockResolvedValue(undefined);
	});

	describe("findReengagementEmailCandidates", () => {
		it("queries through Drizzle with the configured batch limit", async () => {
			const candidates = [makeCandidate()];
			mockLimit.mockResolvedValue(candidates);

			const result = await findReengagementEmailCandidates(
				{} as D1Database,
				NOW,
				25,
			);

			expect(mockSelect).toHaveBeenCalledTimes(1);
			expect(mockFrom).toHaveBeenCalledTimes(1);
			expect(mockWhere).toHaveBeenCalledTimes(1);
			expect(mockOrderBy).toHaveBeenCalledTimes(1);
			expect(mockLimit).toHaveBeenCalledWith(25);
			expect(result).toEqual(candidates);
		});
	});

	describe("sendReengagementEmails", () => {
		const env = {
			EMAIL: { send: vi.fn() },
			DB: {} as D1Database,
			BETTER_AUTH_URL: "https://ration.mayutic.com",
		} as unknown as Env;

		it("sends to eligible verified users returned by the candidate query", async () => {
			mockLimit.mockResolvedValue([makeCandidate()]);

			await sendReengagementEmails(env, NOW);

			expect(mockSendEmail).toHaveBeenCalledTimes(1);
			expect(mockSendEmail).toHaveBeenCalledWith(
				env.EMAIL,
				expect.objectContaining({ to: "billy@example.com" }),
			);
			expect(mockUpdateSet).toHaveBeenCalledWith(
				expect.objectContaining({
					settings: expect.objectContaining({
						reengagementEmailSentAt: NOW.toISOString(),
					}),
				}),
			);
		});

		it("does not send to agent stub accounts", async () => {
			mockLimit.mockResolvedValue([
				makeCandidate({
					email: buildAgentStubEmail("stub-1"),
				}),
			]);

			await sendReengagementEmails(env, NOW);

			expect(mockSendEmail).not.toHaveBeenCalled();
		});

		it("does not send when activity is still inside the inactivity window", async () => {
			mockLimit.mockResolvedValue([
				makeCandidate({
					sessionUpdatedAt: new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000),
				}),
			]);

			await sendReengagementEmails(env, NOW);

			expect(mockSendEmail).not.toHaveBeenCalled();
		});

		it("caps processing to MAX_REENGAGEMENT_EMAILS_PER_RUN from the query", async () => {
			await findReengagementEmailCandidates(
				{} as D1Database,
				NOW,
				MAX_REENGAGEMENT_EMAILS_PER_RUN,
			);

			expect(mockLimit).toHaveBeenCalledWith(MAX_REENGAGEMENT_EMAILS_PER_RUN);
		});
	});
});
