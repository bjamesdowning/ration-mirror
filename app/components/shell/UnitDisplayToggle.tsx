import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useFetcher, useRouteLoaderData } from "react-router";
import {
	UNIT_DISPLAY_MODE_LABELS,
	type UnitDisplayMode,
} from "~/lib/unit-display-mode";
import type { loader } from "~/routes/hub";

const MODES: UnitDisplayMode[] = ["original", "metric", "imperial", "cooking"];

const UnitDisplayModeContext = createContext<UnitDisplayMode>("metric");

export function UnitDisplayModeProvider({ children }: { children: ReactNode }) {
	const hubData = useRouteLoaderData<typeof loader>("routes/hub");
	const serverMode = hubData?.unitDisplayMode ?? "metric";
	const fetcher = useFetcher<{ success?: boolean; mode?: UnitDisplayMode }>();
	const [optimisticMode, setOptimisticMode] = useState<UnitDisplayMode | null>(
		null,
	);

	useEffect(() => {
		if (fetcher.state === "idle") {
			setOptimisticMode(null);
		}
	}, [fetcher.state]);

	const mode = optimisticMode ?? serverMode;

	const submitMode = (nextMode: UnitDisplayMode) => {
		if (nextMode === mode || fetcher.state !== "idle") return;
		setOptimisticMode(nextMode);
		fetcher.submit(
			{ intent: "update-unit-display-mode", mode: nextMode },
			{ method: "post", action: "/hub/settings" },
		);
	};

	const value = useMemo(() => mode, [mode]);

	return (
		<UnitDisplayModeContext.Provider value={value}>
			<UnitDisplayModeActionsContext.Provider
				value={{ submitMode, isPending: fetcher.state !== "idle" }}
			>
				{children}
			</UnitDisplayModeActionsContext.Provider>
		</UnitDisplayModeContext.Provider>
	);
}

type UnitDisplayModeActions = {
	submitMode: (mode: UnitDisplayMode) => void;
	isPending: boolean;
};

const UnitDisplayModeActionsContext = createContext<UnitDisplayModeActions>({
	submitMode: () => {},
	isPending: false,
});

interface UnitDisplayToggleProps {
	className?: string;
}

export function UnitDisplayToggle({ className = "" }: UnitDisplayToggleProps) {
	const activeMode = useUnitDisplayMode();
	const { submitMode, isPending } = useContext(UnitDisplayModeActionsContext);

	return (
		<fieldset
			className={`flex flex-wrap gap-1 rounded-xl border border-platinum/60 bg-platinum/35 p-1 m-0 min-w-0 ${className}`}
			aria-label="Unit display mode"
		>
			<legend className="sr-only">Unit display mode</legend>
			{MODES.map((mode) => (
				<button
					key={mode}
					type="button"
					disabled={isPending}
					onClick={() => submitMode(mode)}
					className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[36px] ${
						activeMode === mode
							? "bg-hyper-green text-carbon"
							: "text-muted hover:text-carbon hover:bg-platinum/70"
					} ${isPending ? "opacity-60" : ""}`}
					aria-pressed={activeMode === mode}
				>
					{UNIT_DISPLAY_MODE_LABELS[mode]}
				</button>
			))}
		</fieldset>
	);
}

export function useUnitDisplayMode(): UnitDisplayMode {
	return useContext(UnitDisplayModeContext);
}
