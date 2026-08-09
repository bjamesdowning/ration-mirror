export const NUTRITION_CONSENT_PURPOSES = [
	"goals",
	"intake",
	"agent_processing",
] as const;

export type NutritionConsentPurpose =
	(typeof NUTRITION_CONSENT_PURPOSES)[number];

export const CURRENT_NUTRITION_CONSENT_POLICY_VERSION = "2026-08-09";
export const CURRENT_NUTRITION_PRIVACY_NOTICE_VERSION = "2026-08-09";

export type NutritionConsentStatement = {
	purpose: NutritionConsentPurpose;
	policyVersion: string;
	statementVersion: string;
	text: string;
	sha256: string;
	privacyNoticeVersion: string;
};

type StatementDefinition = Omit<NutritionConsentStatement, "sha256">;

const STATEMENTS: Record<NutritionConsentPurpose, StatementDefinition> = {
	goals: {
		purpose: "goals",
		policyVersion: CURRENT_NUTRITION_CONSENT_POLICY_VERSION,
		statementVersion: "goals-2026-08-09.1",
		privacyNoticeVersion: CURRENT_NUTRITION_PRIVACY_NOTICE_VERSION,
		text: "I explicitly consent to Mayutic storing the optional daily nutrition goals I enter (energy, protein, carbohydrate, fat, and fibre) as health-related personal data. Ration uses these goals only to show my private nutrition progress and does not use them to make medical decisions. My goals remain until I clear or erase them, withdraw consent and request erasure, or delete my account. I can withdraw consent at any time in Nutrition privacy without affecting processing that occurred before withdrawal. Withdrawal blocks new goal processing; erasure is a separate action. Mayutic is the data controller in Ireland (Registered Business Name 777497, legal@mayutic.com). See the Ration Privacy Policy for my rights and further details.",
	},
	intake: {
		purpose: "intake",
		policyVersion: CURRENT_NUTRITION_CONSENT_POLICY_VERSION,
		statementVersion: "intake-2026-08-09.1",
		privacyNoticeVersion: CURRENT_NUTRITION_PRIVACY_NOTICE_VERSION,
		text: "I explicitly consent to Mayutic storing the meals and portions I choose to log, together with their nutrition values, as health-related personal data. Ration uses this private intake history only to show my nutrition totals and progress and does not use it to make medical decisions. Intake history is retained for approximately 396 days and is then deleted automatically; I may erase it sooner or delete my account. I can withdraw consent at any time in Nutrition privacy without affecting processing that occurred before withdrawal. Withdrawal blocks new intake logging; erasure is a separate action. Mayutic is the data controller in Ireland (Registered Business Name 777497, legal@mayutic.com). See the Ration Privacy Policy for my rights and further details.",
	},
	agent_processing: {
		purpose: "agent_processing",
		policyVersion: CURRENT_NUTRITION_CONSENT_POLICY_VERSION,
		statementVersion: "agent-processing-2026-08-09.1",
		privacyNoticeVersion: CURRENT_NUTRITION_PRIVACY_NOTICE_VERSION,
		text: "I explicitly consent to Mayutic allowing an AI agent I separately authorize to read or change my private nutrition goals or intake for the request I make, within the nutrition OAuth permissions I approve. The connected agent provider may process prompts and tool results under its own retention terms; Ration does not control that provider's retention. This consent does not connect an agent or grant OAuth access by itself, and it does not permit medical advice or autonomous diet decisions. I can withdraw this consent at any time in Nutrition privacy without affecting processing that occurred before withdrawal. Withdrawal blocks future agent nutrition processing; erasure of nutrition data and revocation of connected-agent access are separate actions. Mayutic is the data controller in Ireland (Registered Business Name 777497, legal@mayutic.com). See the Ration Privacy Policy for my rights and further details.",
	},
};

async function sha256Hex(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export async function getNutritionConsentStatement(
	purpose: NutritionConsentPurpose,
): Promise<NutritionConsentStatement> {
	const statement = STATEMENTS[purpose];
	return {
		...statement,
		sha256: await sha256Hex(statement.text),
	};
}

export async function listNutritionConsentStatements(): Promise<
	NutritionConsentStatement[]
> {
	return Promise.all(
		NUTRITION_CONSENT_PURPOSES.map(getNutritionConsentStatement),
	);
}
