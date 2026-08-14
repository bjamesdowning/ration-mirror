import { Play } from "lucide-react";
import { useState } from "react";
import { EXPLAINER_VIDEO_EMBED_URL } from "~/lib/marketing";

const POSTER_URL = "/static/landing/explainer-poster.jpg";

export function ExplainerVideo() {
	const [isPlaying, setIsPlaying] = useState(false);

	return (
		<figure className="splash-video">
			<div className="splash-video-frame">
				{isPlaying ? (
					<iframe
						src={EXPLAINER_VIDEO_EMBED_URL}
						title="Ration explainer video"
						allow="autoplay; encrypted-media; picture-in-picture"
						allowFullScreen
					/>
				) : (
					<button
						type="button"
						className="splash-video-facade"
						onClick={() => setIsPlaying(true)}
						aria-label="Play the Ration explainer video"
					>
						<img
							src={POSTER_URL}
							alt=""
							width={720}
							height={1280}
							fetchPriority="high"
						/>
						<span className="splash-video-scrim" aria-hidden />
						<span className="splash-video-play" aria-hidden>
							<Play size={26} fill="currentColor" />
						</span>
					</button>
				)}
			</div>
			<figcaption>
				<span className="splash-status-dot" aria-hidden />
				Watch the 90-second tour
			</figcaption>
		</figure>
	);
}
