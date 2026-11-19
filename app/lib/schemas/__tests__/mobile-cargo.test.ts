import { describe, expect, it } from "vitest";
import { MobileCargoMergeIntentSchema } from "../mobile/cargo";

describe("MobileCargoMergeIntentSchema", () => {
	it("allows a create with no merge choice", () => {
		expect(
			MobileCargoMergeIntentSchema.parse({}).mergeChoice,
		).toBeUndefined();
	});

	it("accepts create-new", () => {
		expect(
			MobileCargoMergeIntentSchema.parse({ mergeChoice: "new" }).mergeChoice,
		).toBe("new");
	});

	it("requires a target when adding to an existing item", () => {
		const result = MobileCargoMergeIntentSchema.safeParse({
			mergeChoice: "merge",
		});
		expect(result.success).toBe(false);
	});

	it("accepts a merge target", () => {
		expect(
			MobileCargoMergeIntentSchema.parse({
				mergeChoice: "merge",
				mergeTargetId: "cargo_1",
			}),
		).toEqual({ mergeChoice: "merge", mergeTargetId: "cargo_1" });
	});
});
