import { hasAIConsent } from "~/lib/ai-consent.server";
import { getUserSettings, patchUserSettings } from "~/lib/auth.server";
import {
	getCopilotAutoDeductConsent,
	setCopilotAutoDeductConsent,
} from "~/lib/copilot/gate.server";
import {
	eraseNutritionData,
	getNutritionConsentStatus,
	grantNutritionConsent,
	type NutritionConsentSource,
	type NutritionConsentStatus,
	withdrawNutritionConsent,
} from "~/lib/nutrition/consent.server";
import {
	getNutritionConsentStatement,
	NUTRITION_CONSENT_PURPOSES,
} from "~/lib/nutrition/consent-policy";

export class FeatureEnablementAffirmationError extends Error {
	readonly code = "feature_enablement_affirmation_required" as const;
	readonly status = 400 as const;

	constructor(
		message = "Explicit affirmation is required when enabling AI Features or Macro Tracking.",
	) {
		super(message);
		this.name = "FeatureEnablementAffirmationError";
	}
}

export type FeatureEnablementStatus = {
	aiFeatures: boolean;
	macroTracking: boolean;
	autoDeductConsent: boolean;
	aiConsentAt: string | null;
	consents: NutritionConsentStatus[];
};

export type FeatureEnablementEnv = Pick<Env, "DB" | "RATION_KV">;

type Identity = {
	userId: string;
	organizationId: string;
};

type ClientMeta = {
	source: NutritionConsentSource;
	clientSurface: string;
	clientVersion?: string | null;
	locale?: string | null;
};

function isMacroActive(consents: NutritionConsentStatus[]): boolean {
	return NUTRITION_CONSENT_PURPOSES.every(
		(purpose) =>
			consents.find((c) => c.purpose === purpose)?.state === "active",
	);
}

export async function getFeatureEnablementStatus(
	env: FeatureEnablementEnv,
	identity: Identity,
): Promise<FeatureEnablementStatus> {
	const [settings, autoDeductConsent, consents] = await Promise.all([
		getUserSettings(env.DB, identity.userId),
		getCopilotAutoDeductConsent(env, identity),
		Promise.all(
			NUTRITION_CONSENT_PURPOSES.map((purpose) =>
				getNutritionConsentStatus(env.DB, identity.userId, purpose),
			),
		),
	]);

	const aiConsentAt =
		typeof settings.aiConsentAt === "string" && settings.aiConsentAt.trim()
			? settings.aiConsentAt
			: null;

	return {
		aiFeatures: hasAIConsent(settings),
		macroTracking: isMacroActive(consents),
		autoDeductConsent,
		aiConsentAt,
		consents,
	};
}

async function enableAiFeatures(
	env: FeatureEnablementEnv,
	identity: Identity,
	now = new Date(),
): Promise<void> {
	await patchUserSettings(env.DB, identity.userId, {
		aiConsentAt: now.toISOString(),
	});
	await setCopilotAutoDeductConsent(env, identity, true);
}

async function disableAiFeatures(
	env: FeatureEnablementEnv,
	identity: Identity,
): Promise<void> {
	await patchUserSettings(env.DB, identity.userId, {
		aiConsentAt: null,
	});
	await setCopilotAutoDeductConsent(env, identity, false);
}

async function enableMacroTracking(
	env: FeatureEnablementEnv,
	identity: Identity,
	meta: ClientMeta,
): Promise<void> {
	for (const purpose of NUTRITION_CONSENT_PURPOSES) {
		const statement = await getNutritionConsentStatement(purpose);
		await grantNutritionConsent(env.DB, {
			userId: identity.userId,
			purpose,
			source: meta.source,
			policyVersion: statement.policyVersion,
			statementVersion: statement.statementVersion,
			statementSha256: statement.sha256,
			affirmed: true,
			requestId: crypto.randomUUID(),
			clientSurface: meta.clientSurface,
			clientVersion: meta.clientVersion,
			locale: meta.locale,
		});
	}
}

async function disableMacroTracking(
	env: FeatureEnablementEnv,
	identity: Identity,
): Promise<void> {
	for (const purpose of NUTRITION_CONSENT_PURPOSES) {
		await withdrawNutritionConsent(env.DB, {
			userId: identity.userId,
			purpose,
			requestId: crypto.randomUUID(),
		});
	}
}

export async function setFeatureEnablement(
	env: FeatureEnablementEnv,
	identity: Identity,
	input: {
		aiFeatures: boolean;
		macroTracking: boolean;
		affirmed?: true;
	},
	meta: ClientMeta,
): Promise<FeatureEnablementStatus> {
	if ((input.aiFeatures || input.macroTracking) && input.affirmed !== true) {
		throw new FeatureEnablementAffirmationError();
	}

	const current = await getFeatureEnablementStatus(env, identity);

	if (input.aiFeatures && !current.aiFeatures) {
		await enableAiFeatures(env, identity);
	} else if (!input.aiFeatures && current.aiFeatures) {
		await disableAiFeatures(env, identity);
	} else if (input.aiFeatures && current.aiFeatures) {
		// Keep AI on; ensure auto-deduct matches product bundle.
		await setCopilotAutoDeductConsent(env, identity, true);
	}

	if (input.macroTracking) {
		if (!isMacroActive(current.consents)) {
			await enableMacroTracking(env, identity, meta);
		}
	} else if (
		current.macroTracking ||
		current.consents.some((c) => c.state === "active")
	) {
		await disableMacroTracking(env, identity);
	}

	return getFeatureEnablementStatus(env, identity);
}

export async function enableFeature(
	env: FeatureEnablementEnv,
	identity: Identity,
	feature: "ai" | "macro",
	meta: ClientMeta,
): Promise<FeatureEnablementStatus> {
	if (feature === "ai") {
		await enableAiFeatures(env, identity);
	} else {
		await enableMacroTracking(env, identity, meta);
	}
	return getFeatureEnablementStatus(env, identity);
}

export async function disableFeature(
	env: FeatureEnablementEnv,
	identity: Identity,
	feature: "ai" | "macro",
): Promise<FeatureEnablementStatus> {
	if (feature === "ai") {
		await disableAiFeatures(env, identity);
	} else {
		await disableMacroTracking(env, identity);
	}
	return getFeatureEnablementStatus(env, identity);
}

export async function eraseFeatureNutritionData(
	env: FeatureEnablementEnv,
	identity: Identity,
	dataset: "goals" | "intake" | "all",
	requestId: string,
): Promise<FeatureEnablementStatus> {
	await eraseNutritionData(env.DB, {
		userId: identity.userId,
		dataset,
		requestId,
	});
	return getFeatureEnablementStatus(env, identity);
}
