import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useState,
} from "react";

export type ConfirmVariant = "danger" | "warning" | "default";

export interface ConfirmOptions {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: ConfirmVariant;
	consequences?: string[];
	requireTyped?: string;
}

interface ConfirmState extends ConfirmOptions {
	resolve: (value: boolean) => void;
}

interface ConfirmContextValue {
	confirm: (options: ConfirmOptions) => Promise<boolean>;
	pending: ConfirmState | null;
	close: (result: boolean) => void;
}

/**
 * Returns true if the typed value satisfies the requireTyped gate.
 * When no gate is set (requireTyped is undefined) it always returns true.
 * Comparison is case-insensitive.
 */
export function isTypedConfirmMatch(
	requireTyped: string | undefined,
	typedValue: string,
): boolean {
	if (!requireTyped) return true;
	return typedValue.toLowerCase() === requireTyped.toLowerCase();
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
	const [pending, setPending] = useState<ConfirmState | null>(null);

	const confirm = useCallback((options: ConfirmOptions) => {
		return new Promise<boolean>((resolve) => {
			setPending({
				...options,
				confirmLabel: options.confirmLabel ?? "Confirm",
				cancelLabel: options.cancelLabel ?? "Cancel",
				variant: options.variant ?? "default",
				resolve,
			});
		});
	}, []);

	const close = useCallback((result: boolean) => {
		setPending((prev) => {
			prev?.resolve(result);
			return null;
		});
	}, []);

	return (
		<ConfirmContext.Provider value={{ confirm, pending, close }}>
			{children}
		</ConfirmContext.Provider>
	);
}

export function useConfirm(): ConfirmContextValue {
	const ctx = useContext(ConfirmContext);
	if (!ctx) {
		throw new Error("useConfirm must be used within ConfirmProvider");
	}
	return ctx;
}
