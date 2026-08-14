import type { ReactNode } from "react";
import type { LoopStageId } from "~/lib/splash-story";

export function SplashPhone({
	children,
	compact = false,
}: {
	children: ReactNode;
	compact?: boolean;
}) {
	return (
		<div
			className={compact ? "splash-phone splash-phone-compact" : "splash-phone"}
			aria-hidden
		>
			<div className="splash-phone-bezel">
				<span className="splash-phone-notch" />
				<div className="splash-phone-screen">{children}</div>
			</div>
		</div>
	);
}

function StatusBar({ title }: { title: string }) {
	return (
		<div className="splash-os-bar">
			<span>{title}</span>
			<small>Live</small>
		</div>
	);
}

function FuelChip() {
	return (
		<div className="splash-fuel-chip">
			<span>Log your serving</span>
			<small>private</small>
		</div>
	);
}

function CargoScreen() {
	return (
		<>
			<StatusBar title="Cargo" />
			<ul className="splash-os-list">
				<li>
					<strong>Chicken thigh</strong>
					<em>600 g</em>
				</li>
				<li>
					<strong>Greek yogurt</strong>
					<em>4</em>
				</li>
				<li data-warn>
					<strong>Baby spinach</strong>
					<em>expires Thu</em>
				</li>
			</ul>
		</>
	);
}

function GalleyScreen() {
	return (
		<>
			<StatusBar title="Galley" />
			<div className="splash-os-card">
				<strong>Lemon chicken</strong>
				<p>Uses 5 of 6 ingredients already in Cargo</p>
				<div className="splash-os-meter" data-fill="83">
					<span />
				</div>
				<small>83% match · cook tonight</small>
			</div>
		</>
	);
}

const WEEK_DAYS = [
	{ id: "mon", label: "M", on: true },
	{ id: "tue", label: "T", on: true },
	{ id: "wed", label: "W", on: true },
	{ id: "thu", label: "T", on: true },
	{ id: "fri", label: "F", on: true },
	{ id: "sat", label: "S", on: false },
	{ id: "sun", label: "S", on: false },
] as const;

function ManifestScreen({ showFuel }: { showFuel?: boolean }) {
	return (
		<>
			<StatusBar title="Manifest" />
			<div className="splash-os-week" aria-hidden>
				{WEEK_DAYS.map((day) => (
					<span key={day.id} data-on={day.on}>
						{day.label}
					</span>
				))}
			</div>
			<ul className="splash-os-list splash-os-list-tight">
				<li>
					<strong>Mon · Lemon chicken</strong>
					<em>dinner</em>
				</li>
				<li>
					<strong>Tue · Yogurt bowls</strong>
					<em>breakfast</em>
				</li>
			</ul>
			{showFuel ? <FuelChip /> : null}
		</>
	);
}

function SupplyScreen() {
	return (
		<>
			<StatusBar title="Supply" />
			<ul className="splash-os-list">
				<li data-done>
					<strong>Lemons</strong>
					<em>2</em>
				</li>
				<li>
					<strong>Olive oil</strong>
					<em>1</em>
				</li>
				<li>
					<strong>Garlic</strong>
					<em>1</em>
				</li>
			</ul>
			<small className="splash-os-footnote">11 missing · one list</small>
		</>
	);
}

function CookScreen() {
	return (
		<>
			<StatusBar title="Cook" />
			<div className="splash-os-card">
				<strong>Lemon chicken</strong>
				<p>Prepared for the house. Cargo deducted.</p>
				<ul className="splash-os-delta">
					<li>Chicken thigh −600 g</li>
					<li>Spinach −120 g</li>
				</ul>
			</div>
			<FuelChip />
		</>
	);
}

export function SplashKitchenScreen({ stage }: { stage: LoopStageId }) {
	return (
		<div className="splash-os" data-screen={stage}>
			{stage === "cargo" ? <CargoScreen /> : null}
			{stage === "galley" ? <GalleyScreen /> : null}
			{stage === "manifest" ? <ManifestScreen showFuel /> : null}
			{stage === "supply" ? <SupplyScreen /> : null}
			{stage === "dock" ? <CookScreen /> : null}
		</div>
	);
}
