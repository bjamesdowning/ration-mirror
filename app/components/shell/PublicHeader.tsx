import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { lockBodyScroll } from "~/lib/body-scroll-lock";
import { APP_VERSION } from "~/lib/version";

type PublicHeaderProps = {
	breadcrumb?: string;
	breadcrumbHref?: string;
	showLiveVersion?: boolean;
};

const linkClass =
	"py-3 px-3 rounded-lg text-muted hover:bg-carbon/5 hover:text-carbon transition-colors";
const desktopLinkClass = "text-muted hover:text-hyper-green transition-colors";
const signInClass =
	"text-hyper-green font-medium hover:text-hyper-green/80 transition-colors";

export function PublicHeader({
	breadcrumb,
	breadcrumbHref,
	showLiveVersion = false,
}: PublicHeaderProps) {
	const [open, setOpen] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const mobileNavRef = useRef<HTMLElement>(null);
	const isHome = !breadcrumb;

	// Centralized lock so overlapping overlays restore scroll safely.
	useEffect(() => {
		if (!open) return;
		return lockBodyScroll();
	}, [open]);

	useEffect(() => {
		if (!open) return;

		const focusableSelector =
			'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
		const focusables = Array.from(
			mobileNavRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ??
				[],
		);

		const first = focusables[0];
		first?.focus();

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				setOpen(false);
				buttonRef.current?.focus();
				return;
			}

			if (event.key !== "Tab" || focusables.length === 0) {
				return;
			}

			const active = document.activeElement as HTMLElement | null;
			const last = focusables[focusables.length - 1];

			if (event.shiftKey) {
				if (
					!active ||
					active === first ||
					!mobileNavRef.current?.contains(active)
				) {
					event.preventDefault();
					last?.focus();
				}
				return;
			}

			if (active === last) {
				event.preventDefault();
				first?.focus();
			}
		};

		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open]);

	const headerOuter = isHome
		? "relative z-50 border-b border-carbon/10 bg-ceramic"
		: "relative z-50 border-b border-carbon/10 bg-ceramic/90 backdrop-blur sticky top-0";

	// Same max-width and padding as sub-pages (blog, tools) for consistent header layout
	const innerClass =
		"max-w-5xl mx-auto px-6 h-16 flex items-center justify-between w-full min-w-0";

	return (
		<header className={headerOuter}>
			<div className={innerClass}>
				{/* Logo area — green dot + Ration; breadcrumb only on sub-pages */}
				<div className="text-display text-xl text-carbon flex items-center gap-2.5 min-w-0 shrink">
					<Link to="/" className="group flex items-center gap-2.5 shrink-0">
						<div className="w-3 h-3 rounded-full bg-hyper-green group-hover:animate-pulse shadow-glow-sm" />
						Ration
					</Link>
					{breadcrumb && breadcrumbHref && (
						<>
							<span className="text-muted text-base shrink-0"> / </span>
							<Link
								to={breadcrumbHref}
								className="text-muted text-base hover:text-hyper-green transition-colors truncate"
							>
								{breadcrumb}
							</Link>
						</>
					)}
				</div>

				{/* Desktop nav — hidden on mobile */}
				<nav
					className="hidden md:flex items-center gap-4 lg:gap-6 text-sm shrink-0"
					aria-label="Site navigation"
				>
					{isHome ? null : (
						<Link to="/" className={desktopLinkClass}>
							Home
						</Link>
					)}
					<Link to="/blog" className={desktopLinkClass}>
						Blog
					</Link>
					<Link to="/tools" className={desktopLinkClass}>
						Tools
					</Link>
					<Link to="/#pricing" className={desktopLinkClass}>
						Pricing
					</Link>
					<Link to="/legal/terms" className={desktopLinkClass}>
						Terms
					</Link>
					<Link to="/legal/privacy" className={desktopLinkClass}>
						Privacy
					</Link>
					<Link
						to="/#signup"
						className={`${desktopLinkClass} ${signInClass} border border-hyper-green/40 rounded-lg px-3 py-1.5`}
					>
						Sign In
					</Link>
					{isHome && showLiveVersion && (
						<span
							className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-carbon"
							title={`Live version ${APP_VERSION}`}
						>
							<span
								className="w-1.5 h-1.5 rounded-full bg-hyper-green animate-pulse shrink-0"
								aria-hidden
							/>
							Live · v{APP_VERSION}
						</span>
					)}
				</nav>

				{/* Mobile: hamburger + dropdown (portal so it renders above all content) */}
				<div className="relative flex md:hidden shrink-0">
					<button
						ref={buttonRef}
						type="button"
						onClick={() => setOpen(!open)}
						aria-label={open ? "Close menu" : "Open menu"}
						aria-expanded={open}
						className="p-2 -m-2 text-muted hover:text-carbon transition-colors rounded-lg"
					>
						{open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
					</button>
					{open &&
						typeof document !== "undefined" &&
						createPortal(
							<>
								{/* Backdrop — full viewport, catches clicks to close */}
								<div
									className="fixed inset-0 z-[9998] bg-carbon/50 backdrop-blur-sm md:hidden"
									aria-hidden
									onClick={() => setOpen(false)}
								/>
								{/* Dropdown panel — fixed, above all content, solid background */}
								<nav
									ref={mobileNavRef}
									className="fixed top-16 right-4 left-4 sm:left-auto sm:w-80 z-[9999] py-4 px-4 bg-ceramic border border-carbon/10 rounded-xl shadow-2xl md:hidden"
									aria-label="Mobile navigation"
								>
									<div className="flex flex-col gap-1">
										{isHome ? null : (
											<Link
												to="/"
												className={linkClass}
												onClick={() => setOpen(false)}
											>
												Home
											</Link>
										)}
										<Link
											to="/blog"
											className={linkClass}
											onClick={() => setOpen(false)}
										>
											Blog
										</Link>
										<Link
											to="/tools"
											className={linkClass}
											onClick={() => setOpen(false)}
										>
											Tools
										</Link>
										<Link
											to="/#pricing"
											className={linkClass}
											onClick={() => setOpen(false)}
										>
											Pricing
										</Link>
										<Link
											to="/legal/terms"
											className={linkClass}
											onClick={() => setOpen(false)}
										>
											Terms
										</Link>
										<Link
											to="/legal/privacy"
											className={linkClass}
											onClick={() => setOpen(false)}
										>
											Privacy
										</Link>
										<Link
											to="/#signup"
											className={`${linkClass} ${signInClass} mt-2 border border-hyper-green/40 rounded-lg`}
											onClick={() => setOpen(false)}
										>
											Sign In
										</Link>
										{isHome && showLiveVersion && (
											<div className="flex items-center gap-2 py-3 px-3 mt-2 pt-4 border-t border-carbon/10">
												<span
													className="w-1.5 h-1.5 rounded-full bg-hyper-green animate-pulse shrink-0"
													aria-hidden
												/>
												<span className="text-xs font-bold uppercase tracking-wider text-carbon">
													Live · v{APP_VERSION}
												</span>
											</div>
										)}
									</div>
								</nav>
							</>,
							document.body,
						)}
				</div>
			</div>
		</header>
	);
}
