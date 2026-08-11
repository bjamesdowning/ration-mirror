import { describe, expect, it } from "vitest";
import {
	intakeNotesForCanonicalHash,
	resolveIntakeNotesForWrite,
} from "../service.server";

describe("nutrition-intake-notes flag write policy", () => {
	it("persists requested notes when the flag is on", () => {
		expect(
			resolveIntakeNotesForWrite({
				notesEnabled: true,
				requestedNotes: " late snack ",
				priorNotes: "old",
			}),
		).toBe(" late snack ");
		expect(
			resolveIntakeNotesForWrite({
				notesEnabled: true,
				requestedNotes: null,
				priorNotes: "old",
			}),
		).toBeNull();
	});

	it("preserves prior notes when the flag is off (kill-switch safe)", () => {
		expect(
			resolveIntakeNotesForWrite({
				notesEnabled: false,
				requestedNotes: "client sent while off",
				priorNotes: "keep me",
			}),
		).toBe("keep me");
		expect(
			resolveIntakeNotesForWrite({
				notesEnabled: false,
				requestedNotes: "ignored",
				priorNotes: null,
			}),
		).toBeNull();
	});

	it("includes notes in the request hash only when the flag is on", () => {
		expect(intakeNotesForCanonicalHash(true, "hello")).toEqual({
			notes: "hello",
		});
		expect(intakeNotesForCanonicalHash(true, undefined)).toEqual({
			notes: null,
		});
		expect(intakeNotesForCanonicalHash(false, "hello")).toEqual({});
	});
});
