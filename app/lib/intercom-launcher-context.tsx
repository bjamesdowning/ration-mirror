import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

type IntercomLauncherContextValue = {
	hasUnread: boolean;
	setHasUnread: (value: boolean) => void;
	resetUnread: () => void;
};

const IntercomLauncherContext =
	createContext<IntercomLauncherContextValue | null>(null);

export function IntercomLauncherProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [hasUnread, setHasUnreadState] = useState(false);

	const setHasUnread = useCallback((value: boolean) => {
		setHasUnreadState(value);
	}, []);

	const resetUnread = useCallback(() => {
		setHasUnreadState(false);
	}, []);

	const value = useMemo(
		() => ({ hasUnread, setHasUnread, resetUnread }),
		[hasUnread, setHasUnread, resetUnread],
	);

	return (
		<IntercomLauncherContext.Provider value={value}>
			{children}
		</IntercomLauncherContext.Provider>
	);
}

export function useIntercomLauncher(): IntercomLauncherContextValue {
	const ctx = useContext(IntercomLauncherContext);
	if (!ctx) {
		throw new Error(
			"useIntercomLauncher must be used within IntercomLauncherProvider",
		);
	}
	return ctx;
}
