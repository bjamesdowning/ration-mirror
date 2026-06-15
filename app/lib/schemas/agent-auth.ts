import { z } from "zod";

export const agentAnonRegisterSchema = z.object({
	type: z.literal("anonymous"),
	client_hint: z.string().max(200).optional(),
});

export const agentClaimStartSchema = z.object({
	claim_token: z.string().min(16).max(128),
	email: z.string().email().max(320),
});

export const agentClaimCompleteSchema = z.object({
	claim_token: z.string().min(16).max(128),
	email: z.string().email().max(320),
	otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

export type AgentAnonRegisterInput = z.infer<typeof agentAnonRegisterSchema>;
export type AgentClaimStartInput = z.infer<typeof agentClaimStartSchema>;
export type AgentClaimCompleteInput = z.infer<typeof agentClaimCompleteSchema>;
