import { z } from "zod";

export const CopilotRoleSchema = z.enum([
	"user",
	"assistant",
	"system",
	"tool",
]);
export type CopilotRole = z.infer<typeof CopilotRoleSchema>;

export const CopilotToolErrorCodeSchema = z.enum([
	"rate_limited",
	"invalid_input",
	"not_found",
	"unauthorized",
	"insufficient_scope",
	"capacity_exceeded",
	"conflict",
	"idempotency_replay",
	"internal_error",
	"insufficient_cargo",
	"insufficient_credits",
	"session_limit_reached",
	"invalid_message",
	"agent_error",
	"socket_closed",
]);

export const CopilotMessageSchema = z.object({
	id: z.string().min(1),
	role: CopilotRoleSchema,
	content: z.string(),
	createdAt: z.string().datetime().optional(),
	toolCallId: z.string().optional(),
});
export type CopilotMessage = z.infer<typeof CopilotMessageSchema>;

export const CopilotToolStatusSchema = z.object({
	toolCallId: z.string().min(1),
	toolName: z.string().min(1),
	label: z.string().min(1),
});

export const CopilotBlockedFeatureSchema = z.object({
	feature: z.enum(["scan", "import_url"]),
	message: z.string().min(1),
	deepLink: z.string().min(1),
});
export type CopilotBlockedFeature = z.infer<typeof CopilotBlockedFeatureSchema>;

export const CopilotAllowanceStatusSchema = z.object({
	tier: z.string().min(1),
	freeConversationsRemaining: z.number().int().min(0),
	allowanceResetAt: z.string().datetime(),
	creditBalance: z.number().int().min(0),
	autoDeductConsent: z.boolean(),
	conversationFloorCost: z.number().int().positive(),
	sessionIdleMs: z.number().int().positive(),
	brackets: z.array(
		z.object({
			maxTokens: z.number().int().positive().nullable(),
			credits: z.number().int().positive(),
		}),
	),
	onboardingBriefingEligible: z.boolean().optional(),
	onboardingBriefingConsumed: z.boolean().optional(),
});
export type CopilotAllowanceStatus = z.infer<
	typeof CopilotAllowanceStatusSchema
>;

export const CopilotSessionUsageSchema = z.object({
	totalTokens: z.number().int().min(0),
	maxTokens: z.number().int().positive(),
	messageCount: z.number().int().min(0),
	maxMessages: z.number().int().positive(),
	creditsCharged: z.number().int().min(0),
	creditBalance: z.number().int().min(0),
	nextBracketAt: z.number().int().positive().nullable(),
});
export type CopilotSessionUsage = z.infer<typeof CopilotSessionUsageSchema>;

export const CopilotSessionLimitWarningSchema = z.object({
	severity: z.enum(["soft", "urgent"]),
	message: z.string().min(1),
});
export type CopilotSessionLimitWarning = z.infer<
	typeof CopilotSessionLimitWarningSchema
>;

export const CopilotStreamEventSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("message_start"),
		message: CopilotMessageSchema,
	}),
	z.object({
		type: z.literal("text_delta"),
		messageId: z.string().min(1),
		text: z.string(),
	}),
	z.object({
		type: z.literal("message_end"),
		messageId: z.string().min(1),
		usageTokens: z.number().int().min(0).optional(),
	}),
	z.object({
		type: z.literal("tool_start"),
		status: CopilotToolStatusSchema,
	}),
	z.object({
		type: z.literal("tool_end"),
		toolCallId: z.string().min(1),
		ok: z.boolean(),
		result: z.unknown().optional(),
		error: z
			.object({
				code: CopilotToolErrorCodeSchema,
				message: z.string().min(1),
			})
			.optional(),
	}),
	z.object({
		type: z.literal("approval_request"),
		approvalId: z.string().min(1),
		toolName: z.string().min(1),
		title: z.string().min(1),
		description: z.string().min(1),
		payload: z.unknown().optional(),
	}),
	z.object({
		type: z.literal("allowance_update"),
		status: CopilotAllowanceStatusSchema,
	}),
	z.object({
		type: z.literal("session_usage_update"),
		usage: CopilotSessionUsageSchema,
	}),
	z.object({
		type: z.literal("session_limit_warning"),
		warning: CopilotSessionLimitWarningSchema,
	}),
	z.object({
		type: z.literal("blocked_feature"),
		blocked: CopilotBlockedFeatureSchema,
	}),
	z.object({
		type: z.literal("error"),
		error: z.object({
			code: z.string().min(1),
			message: z.string().min(1),
		}),
		retryAfter: z.number().int().positive().optional(),
	}),
]);
export type CopilotStreamEvent = z.infer<typeof CopilotStreamEventSchema>;

export const CopilotStatusResponseSchema = CopilotAllowanceStatusSchema;
export type CopilotStatusResponse = z.infer<typeof CopilotStatusResponseSchema>;
