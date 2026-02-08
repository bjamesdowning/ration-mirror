import { useCallback, useEffect, useState } from "react";

interface UseToastOptions {
	duration?: number;
}

export function useToast(options: UseToastOptions = {}) {
	const { duration = 4000 } = options;
	const [isOpen, setIsOpen] = useState(false);

	const show = useCallback(() => setIsOpen(true), []);
	const hide = useCallback(() => setIsOpen(false), []);

	useEffect(() => {
		if (!isOpen) return;
		const timeoutId = setTimeout(() => setIsOpen(false), duration);
		return () => clearTimeout(timeoutId);
	}, [isOpen, duration]);

	return { isOpen, show, hide };
}
