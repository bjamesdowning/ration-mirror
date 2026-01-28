export interface ListGenerationSettings {
	frequency: "off" | "daily" | "weekly" | "custom";
	intervalDays?: number;
	lastGeneratedAt?: string | null; // ISO Date string
}

export interface UserSettings {
	unitSystem?: "metric" | "imperial";
	expirationAlertDays?: number;
	listGeneration?: ListGenerationSettings;
}
