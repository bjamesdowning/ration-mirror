type BodyScrollHost = {
	body: {
		style: {
			overflow: string;
		};
	};
};

let activeLockCount = 0;
let previousOverflowValue: string | null = null;

/**
 * Shared body scroll lock manager for overlay-style UI.
 * Multiple overlays can lock safely; scrolling is restored when the last one closes.
 */
export function lockBodyScroll(host?: BodyScrollHost): () => void {
	const target =
		host ??
		(typeof document !== "undefined"
			? ({
					body: document.body,
				} as BodyScrollHost)
			: null);

	if (!target) {
		return () => {};
	}

	if (activeLockCount === 0) {
		previousOverflowValue = target.body.style.overflow;
		target.body.style.overflow = "hidden";
	}

	activeLockCount += 1;
	let released = false;

	return () => {
		if (released) return;
		released = true;
		activeLockCount = Math.max(0, activeLockCount - 1);

		if (activeLockCount === 0) {
			target.body.style.overflow = previousOverflowValue ?? "";
			previousOverflowValue = null;
		}
	};
}

export function resetBodyScrollLockForTests() {
	activeLockCount = 0;
	previousOverflowValue = null;
}
