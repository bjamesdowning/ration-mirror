import { Camera } from "lucide-react";
import {
	AIFeatureIntroView,
	AIFeatureModal,
} from "~/components/ai/AIFeatureModal";

interface ReplenishScanIntroModalProps {
	open: boolean;
	onClose: () => void;
	onConfirm: () => void;
	credits: number;
	costPerScan: number;
}

/**
 * Credit-gated intro before supply replenish scan — mirrors Cargo ScanIntroModal.
 */
export function ReplenishScanIntroModal({
	open,
	onClose,
	onConfirm,
	credits,
	costPerScan,
}: ReplenishScanIntroModalProps) {
	return (
		<AIFeatureModal
			open={open}
			onClose={onClose}
			title="Replenish from receipt"
			subtitle="Match to your supply list"
			icon={<Camera className="w-5 h-5 text-hyper-green" />}
			maxWidth="sm"
			titleId="replenish-scan-intro-title"
		>
			<AIFeatureIntroView
				description="AI reads your receipt, matches lines to your Supply list, then docks purchased items to Cargo."
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
