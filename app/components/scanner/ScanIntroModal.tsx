import { Camera } from "lucide-react";
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
