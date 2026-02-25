import { z } from "zod";

export const TransferCreditsSchema = z
	.object({
		sourceOrganizationId: z.string().uuid(),
		destinationOrganizationId: z.string().uuid(),
		amount: z.coerce.number().int().min(1).max(10_000),
	})
	.refine(
		(data) => data.sourceOrganizationId !== data.destinationOrganizationId,
		{ message: "Source and destination must differ" },
	);

export type TransferCreditsInput = z.infer<typeof TransferCreditsSchema>;
