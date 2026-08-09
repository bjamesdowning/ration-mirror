import { Camera } from "lucide-react";
import { useRouteLoaderData } from "react-router";
import {
	AIFeatureIntroView,
	AIFeatureModal,
} from "~/components/ai/AIFeatureModal";

interface ScanIntroModalProps {
	open: boolean;
	onClose: () => void;
	onConfirm: () => void;
	/** Current group credit balance */
	credits: number;
	/** Credit cost per scan (from loader aiCosts.SCAN) */
	costPerScan: number;
}

/** One-liner when nutritionEngine is on — USDA first, labelled estimates, edit before save. */
const NUTRITION_INGEST_HINT =
	"Nutrition (when available): USDA match first; AI estimates are labelled—edit before saving.";

/**
 * Intro modal shown before opening the camera for Scan. Uses shared AI feature modal and credit-gated intro view.
 */
export function ScanIntroModal({
	open,
	onClose,
	onConfirm,
	credits,
	costPerScan,
}: ScanIntroModalProps) {
	const rootData = useRouteLoaderData("root") as
		| { clientFlags?: { nutritionEngine?: boolean } }
		| undefined;
	const nutritionEngine = rootData?.clientFlags?.nutritionEngine === true;

	return (
		<AIFeatureModal
			open={open}
			onClose={onClose}
			title="Scan to add items"
			subtitle="Receipts, labels, or pantry photos"
			icon={<Camera className="w-5 h-5 text-hyper-green" />}
			maxWidth="sm"
			titleId="scan-intro-title"
		>
			<AIFeatureIntroView
				description="AI reads grocery receipts, product labels, or photos of your fridge, pantry, or shelves—and suggests items to add to Cargo. Review and edit before saving."
				hint={nutritionEngine ? NUTRITION_INGEST_HINT : undefined}
				cost={costPerScan}
				costLabel="per scan"
				credits={credits}
				onCancel={onClose}
				onConfirm={onConfirm}
				confirmLabel="Continue"
			/>
		</AIFeatureModal>
	);
}
