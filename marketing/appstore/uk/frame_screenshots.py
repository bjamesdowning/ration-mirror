#!/usr/bin/env python3
"""Composite App Store marketing frames from raw device screenshots.

Exports both display classes App Store Connect accepts for iPhone:
  - framed/6.9/  → 1320×2868  (iPhone 6.9" — preferred; View All Sizes)
  - framed/6.5/  → 1284×2778  (iPhone 6.5" — matches the common upload error)
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
FRAMED = ROOT / "framed"
FONT_BOLD = (
	ROOT.parents[2]
	/ "ios"
	/ "Ration"
	/ "Resources"
	/ "Fonts"
	/ "SpaceMono-Bold.ttf"
)

CARBON = (17, 17, 17, 255)
HYPER = (0, 224, 136, 255)
WHITE = (248, 249, 250, 255)

FRAMES: list[tuple[str, str]] = [
	("01-hub", "Your kitchen,\noperable by AI"),
	("02-cargo", "Know your stock\nbefore it spoils"),
	("03-ask", "Ask Ration.\nLive kitchen answers"),
	("04-scan", "Scan once.\nCargo stays current"),
	("05-galley", "See meals you\ncan cook right now"),
	("06-generate", "Meal ideas from\nwhat you already have"),
	("07-manifest", "Plan the week.\nKeep the crew aligned"),
	("08-supply", "Shop only what\nyou're still missing"),
]


@dataclass(frozen=True)
class DisplaySize:
	label: str
	width: int
	height: int
	caption_font: int
	wordmark_font: int
	caption_top: int
	caption_bottom: int
	wordmark_y: int
	device_radius: int


SIZES = (
	DisplaySize("6.9", 1320, 2868, 52, 28, 80, 330, 110, 72),
	DisplaySize("6.5", 1284, 2778, 50, 26, 76, 318, 100, 68),
)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
	if FONT_BOLD.is_file():
		return ImageFont.truetype(str(FONT_BOLD), size=size)
	return ImageFont.load_default()


def rounded_device(
	shot: Image.Image,
	*,
	canvas_w: int,
	canvas_h: int,
	radius: int,
) -> Image.Image:
	max_h = int(canvas_h * 0.78)
	max_w = int(canvas_w * 0.88)
	shot = shot.convert("RGBA")
	shot.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)

	bezel = 10
	outer_w = shot.width + bezel * 2
	outer_h = shot.height + bezel * 2
	outer = Image.new("RGBA", (outer_w, outer_h), (0, 0, 0, 0))
	mask = Image.new("L", (outer_w, outer_h), 0)
	ImageDraw.Draw(mask).rounded_rectangle(
		(0, 0, outer_w - 1, outer_h - 1), radius=radius, fill=255
	)

	bezel_layer = Image.new("RGBA", (outer_w, outer_h), (0, 0, 0, 0))
	ImageDraw.Draw(bezel_layer).rounded_rectangle(
		(0, 0, outer_w - 1, outer_h - 1),
		radius=radius,
		outline=HYPER,
		width=3,
	)
	inner_mask = Image.new("L", shot.size, 0)
	ImageDraw.Draw(inner_mask).rounded_rectangle(
		(0, 0, shot.width - 1, shot.height - 1),
		radius=max(8, radius - bezel),
		fill=255,
	)
	phone = Image.new("RGBA", shot.size, (0, 0, 0, 255))
	phone.paste(shot, (0, 0), inner_mask)
	outer.paste(phone, (bezel, bezel), phone)
	outer = Image.alpha_composite(outer, bezel_layer)
	outer.putalpha(mask)
	return outer


def soft_glow(size: tuple[int, int]) -> Image.Image:
	glow = Image.new("RGBA", size, (0, 0, 0, 0))
	g = ImageDraw.Draw(glow)
	cx, cy = size[0] // 2, int(size[1] * 0.42)
	r = int(min(size) * 0.38)
	g.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(0, 224, 136, 55))
	return glow.filter(ImageFilter.GaussianBlur(radius=90))


def draw_caption(canvas: Image.Image, text: str, size: DisplaySize) -> None:
	draw = ImageDraw.Draw(canvas)
	font = load_font(size.caption_font)
	lines = text.split("\n")
	line_gap = 18
	underline_gap = 28
	underline_h = 6

	ascent, descent = font.getmetrics()
	widths = [draw.textlength(line, font=font) for line in lines]

	baseline = size.caption_top + ascent
	last_ink_bottom = baseline
	for i, line in enumerate(lines):
		x = int((size.width - widths[i]) // 2)
		draw.text((x, baseline), line, font=font, fill=WHITE)
		bbox = draw.textbbox((x, baseline), line, font=font)
		last_ink_bottom = bbox[3]
		baseline += ascent + descent + line_gap

	uw = min(360, int(max(widths) if widths else 200))
	ux = (size.width - uw) // 2
	uy = last_ink_bottom + underline_gap
	draw.rounded_rectangle((ux, uy, ux + uw, uy + underline_h), radius=3, fill=HYPER)


def draw_wordmark(canvas: Image.Image, size: DisplaySize) -> None:
	draw = ImageDraw.Draw(canvas)
	font = load_font(size.wordmark_font)
	label = "RATION"
	bbox = draw.textbbox((0, 0), label, font=font)
	tw = bbox[2] - bbox[0]
	x = (size.width - tw) // 2
	y = size.height - size.wordmark_y
	draw.text((x, y), label, font=font, fill=HYPER)


def compose(stem: str, caption: str, size: DisplaySize) -> None:
	src = RAW / f"{stem}.png"
	if not src.is_file():
		raise FileNotFoundError(src)
	shot = Image.open(src).convert("RGBA")

	base = Image.new("RGBA", (size.width, size.height), CARBON)
	base = Image.alpha_composite(base, soft_glow((size.width, size.height)))
	draw_caption(base, caption, size)

	device = rounded_device(
		shot,
		canvas_w=size.width,
		canvas_h=size.height,
		radius=size.device_radius,
	)
	dx = (size.width - device.width) // 2
	wordmark_top = size.height - size.wordmark_y
	available = wordmark_top - size.caption_bottom
	dy = size.caption_bottom + max(0, (available - device.height) // 2)
	base.paste(device, (dx, dy), device)
	draw_wordmark(base, size)

	out = base.convert("RGB")
	out_dir = FRAMED / size.label
	out_dir.mkdir(parents=True, exist_ok=True)
	dest = out_dir / f"{stem}.png"
	out.save(dest, format="PNG", optimize=True)
	assert out.size == (size.width, size.height), out.size
	print(f"wrote {dest.relative_to(ROOT)} ({out.size[0]}×{out.size[1]})")


def main() -> None:
	# Remove stale flat framed/*.png from older exports
	for stale in FRAMED.glob("*.png"):
		stale.unlink()
		print(f"removed stale {stale.name}")

	for size in SIZES:
		for stem, caption in FRAMES:
			compose(stem, caption, size)
	print("done")


if __name__ == "__main__":
	main()
