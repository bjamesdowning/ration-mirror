import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router";

interface PrimitiveLinkProps {
	type: "meal" | "cargo";
	id: string;
	children: ReactNode;
	className?: string;
	title?: string;
	onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

export function PrimitiveLink({
	type,
	id,
	children,
	className = "",
	title,
	onClick,
}: PrimitiveLinkProps) {
	const href = type === "meal" ? `/hub/galley/${id}` : `/hub/cargo/${id}`;
	return (
		<Link to={href} className={className} title={title} onClick={onClick}>
			{children}
		</Link>
	);
}
