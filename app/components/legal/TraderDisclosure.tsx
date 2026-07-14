import { LEGAL_ENTITY } from "~/lib/legal-entity.constants";

type TraderDisclosureProps = {
	/** Compact single-block layout for public footer. */
	variant?: "full" | "compact";
	className?: string;
};

/**
 * E-commerce trader identification (S.I. No. 68/2003).
 * Renders business name, address, RBN, contact email, and VAT when registered.
 */
export function TraderDisclosure({
	variant = "full",
	className = "",
}: TraderDisclosureProps) {
	const {
		businessName,
		formattedAddress,
		registeredBusinessNameNumber,
		emails,
		vatNumber,
	} = LEGAL_ENTITY;

	if (variant === "compact") {
		return (
			<p className={`text-xs text-muted ${className}`}>
				{businessName} · {LEGAL_ENTITY.address.locality}, Ireland · RBN{" "}
				{registeredBusinessNameNumber}
				{vatNumber ? ` · VAT ${vatNumber}` : null}
				{" · "}
				<a
					href={`mailto:${emails.legal}`}
					className="hover:text-hyper-green transition-colors"
				>
					{emails.legal}
				</a>
			</p>
		);
	}

	return (
		<address
			className={`not-italic text-xs text-muted leading-relaxed ${className}`}
		>
			<p className="font-semibold text-carbon">{businessName}</p>
			<p>{formattedAddress}</p>
			<p>Registered Business Name No. {registeredBusinessNameNumber}</p>
			{vatNumber ? <p>VAT Registration No. {vatNumber}</p> : null}
			<p>
				<a
					href={`mailto:${emails.legal}`}
					className="text-hyper-green hover:underline"
				>
					{emails.legal}
				</a>
			</p>
		</address>
	);
}
