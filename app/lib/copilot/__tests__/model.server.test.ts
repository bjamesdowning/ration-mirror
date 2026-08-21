import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	CopilotGatewayUnconfiguredError,
	createCopilotGatewayModel,
} from "../model.server";
import { COPILOT_GEMINI_MODEL_ID } from "../model-profiles";

const { mockCreateWorkersAI, mockModelFactory } = vi.hoisted(() => {
	const mockModelFactory = vi.fn((id: string) => ({ modelId: id }));
	const mockCreateWorkersAI = vi.fn((_options?: unknown) => mockModelFactory);
	return { mockCreateWorkersAI, mockModelFactory };
});

vi.mock("workers-ai-provider", () => ({
	createWorkersAI: (options: unknown) => mockCreateWorkersAI(options),
}));

vi.mock("workers-ai-provider/google", () => ({
	google: { id: "google-plugin" },
}));

vi.mock("workers-ai-provider/openai", () => ({
	openai: { id: "openai-plugin" },
}));

describe("createCopilotGatewayModel", () => {
	beforeEach(() => {
		mockCreateWorkersAI.mockClear();
		mockModelFactory.mockClear();
		mockCreateWorkersAI.mockReturnValue(mockModelFactory);
	});

	it("throws when AI_GATEWAY_ID is missing", () => {
		expect(() =>
			createCopilotGatewayModel({
				AI: {} as Ai,
			}),
		).toThrow(CopilotGatewayUnconfiguredError);
		expect(mockCreateWorkersAI).not.toHaveBeenCalled();
	});

	it("throws when AI_GATEWAY_ID is blank", () => {
		expect(() =>
			createCopilotGatewayModel({
				AI: {} as Ai,
				AI_GATEWAY_ID: "  ",
			}),
		).toThrow("copilot_gateway_unconfigured");
	});

	it("pins ration-gateway with openai+google plugins, skipCache, and no extra retries", () => {
		const binding = { run: vi.fn() } as unknown as Ai;
		const model = createCopilotGatewayModel({
			AI: binding,
			AI_GATEWAY_ID: "ration-gateway",
			RATION_ENV: "production",
		});

		expect(mockCreateWorkersAI).toHaveBeenCalledWith({
			binding,
			providers: [{ id: "openai-plugin" }, { id: "google-plugin" }],
			gateway: {
				id: "ration-gateway",
				skipCache: true,
				retries: { maxAttempts: 1 },
				metadata: { feature: "copilot", env: "production" },
			},
		});
		expect(mockModelFactory).toHaveBeenCalledWith(COPILOT_GEMINI_MODEL_ID);
		expect(model).toEqual({ modelId: COPILOT_GEMINI_MODEL_ID });
	});
});
