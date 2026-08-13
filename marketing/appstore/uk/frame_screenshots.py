#!/usr/bin/env python3
"""Composite App Store marketing frames from raw device screenshots.

Layouts:
  zoom   — large cropped UI, benefit caption, optional chips
  device — full-screen proof shot in a phone bezel
  social — tilted share-sheet hero + floating import card + source chips
  split  — diagonal light / dark of the same surface

Exports:
  framed/6.9/  → 1320×2868  (iPhone 6.9" — preferred)
  framed/6.5/  → 1284×2778  (iPhone 6.5" fallback)
"""

from __future__ import annotations

from dataclasses import dataclass, field
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
CERAMIC = (248, 249, 250, 255)
HYPER = (0, 224, 136, 255)
WHITE = (248, 249, 250, 255)
PLATINUM = (230, 230, 230, 255)
MUTED = (160, 168, 164, 255)


@dataclass(frozen=True)
class DisplaySize:
	label: str
	width: int
	height: int
	caption_font: int
	wordmark_font: int
	caption_top: int
	device_radius: int
	chip_font: int


SIZES = (
	DisplaySize("6.9", 1320, 2868, 50, 26, 72, 68, 22),
	DisplaySize("6.5", 1284, 2778, 48, 24, 68, 64, 20),
)


@dataclass(frozen=True)
class FrameSpec:
	stem: str
	caption: str
	layout: str
	source: str
	crop: tuple[float, float, float, float] = (0.0, 0.0, 1.0, 1.0)
	chips: tuple[str, ...] = ()
	secondary: str | None = None
	secondary_crop: tuple[float, float, float, float] = (0.04, 0.34, 0.96, 0.78)
	hide_testflight: bool = True
	dark_ui: bool = True
	cover_rects: tuple[tuple[float, float, float, float], ...] = ()
	light_source: str | None = None
	light_crop: tuple[float, float, float, float] | None = None


FRAMES: tuple[FrameSpec, ...] = (
	FrameSpec(
		stem="01-hub",
		caption="Plan meals from\nwhat's in stock",
		layout="zoom",
		source="01-hub.png",
		crop=(0.0, 0.08, 1.0, 0.68),
		chips=("Pantry", "Plan", "Shop"),
	),
	FrameSpec(
		stem="02-macros",
		caption="Macros from meals\nyou actually cook",
		layout="zoom",
		source="01-hub.png",
		crop=(0.03, 0.105, 0.97, 0.46),
		chips=("Daily Fuel",),
	),
	FrameSpec(
		stem="03-import",
		caption="Save recipes from\nTikTok, Reels & the web",
		layout="social",
		source="03-share.png",
		crop=(0.0, 0.0, 1.0, 1.0),
		chips=("Instagram", "YouTube", "Safari"),
		secondary="03-import.png",
	),
	FrameSpec(
		stem="04-scan",
		caption="Scan a receipt\nor the fridge",
		layout="zoom",
		source="04-scan.png",
		crop=(0.0, 0.07, 1.0, 0.78),
		chips=("Then pantry updates",),
		secondary="02-cargo.png",
		secondary_crop=(0.0, 0.18, 1.0, 0.58),
	),
	FrameSpec(
		stem="05-galley",
		caption="See what you can cook\nwith what's here",
		layout="zoom",
		source="05-galley.png",
		crop=(0.0, 0.08, 1.0, 0.74),
		chips=("Recipes", "Galley"),
	),
	FrameSpec(
		stem="06-plan",
		caption="Plan the week.\nAI fills the days.",
		layout="device",
		source="06-plan.png",
		crop=(0.0, 0.0, 1.0, 1.0),
	),
	FrameSpec(
		stem="07-manifest",
		caption="Cook for the house.\nLog your plate.",
		layout="zoom",
		source="07-manifest.png",
		# Date + gauges + Beef Tacos + first intake row; hide TestFlight/avatar above.
		crop=(0.0, 0.105, 1.0, 0.76),
		chips=("Private intake",),
		hide_testflight=True,
		# Cover "Billy Downing's Personal Group" on the first intake title.
		cover_rects=((0.40, 0.928, 0.98, 0.962),),
	),
	FrameSpec(
		stem="08-supply",
		caption="Shop only what\nyou're still missing",
		layout="device",
		source="08-supply.png",
		crop=(0.0, 0.0, 1.0, 0.93),
		chips=("Shopping list", "Supply"),
	),
	FrameSpec(
		stem="09-ask",
		caption="Your kitchen copilot,\non live stock",
		layout="zoom",
		source="09-ask.png",
		crop=(0.0, 0.205, 1.0, 0.86),
		chips=("Ask Ration",),
		hide_testflight=False,
	),
	FrameSpec(
		stem="10-theme",
		caption="Light or dark.\nSame kitchen.",
		layout="split",
		source="01-hub.png",
		crop=(0.0, 0.08, 1.0, 0.70),
		light_source="10-hub-light.png",
		light_crop=(0.0, 0.08, 1.0, 0.70),
		hide_testflight=True,
	),
)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
	if FONT_BOLD.is_file():
		return ImageFont.truetype(str(FONT_BOLD), size=size)
	return ImageFont.load_default()


def open_rgb(name: str) -> Image.Image:
	path = RAW / name
	if not path.is_file():
		raise FileNotFoundError(path)
	return Image.open(path).convert("RGBA")


def crop_rel(img: Image.Image, box: tuple[float, float, float, float]) -> Image.Image:
	w, h = img.size
	l, t, r, b = box
	return img.crop((int(w * l), int(h * t), int(w * r), int(h * b)))


def cover_rects(img: Image.Image, rects: tuple[tuple[float, float, float, float], ...]) -> Image.Image:
	if not rects:
		return img
	out = img.copy()
	draw = ImageDraw.Draw(out)
	w, h = out.size
	for l, t, r, b in rects:
		fill = (26, 26, 26, 255)
		draw.rounded_rectangle(
			(int(w * l), int(h * t), int(w * r), int(h * b)),
			radius=6,
			fill=fill,
		)
	return out


def hide_testflight(img: Image.Image, dark: bool) -> Image.Image:
	"""Cover TestFlight / time on the left of the status bar; stamp 9:41."""
	out = img.copy()
	w, h = out.size
	bar_h = max(36, int(h * 0.042))
	cover_w = int(w * 0.36)
	sample = out.getpixel((min(w - 1, cover_w + 8), max(0, bar_h // 2)))
	fill = sample[:3] + (255,) if isinstance(sample, tuple) else ((0, 0, 0, 255) if dark else CERAMIC)
	draw = ImageDraw.Draw(out)
	draw.rectangle((0, 0, cover_w, bar_h), fill=fill)
	font = load_font(max(18, int(bar_h * 0.48)))
	text_fill = WHITE if dark else (17, 17, 17, 255)
	draw.text((int(w * 0.07), int(bar_h * 0.22)), "9:41", font=font, fill=text_fill)
	return out


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
	mask = Image.new("L", size, 0)
	ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
	return mask


def phone_bezel(shot: Image.Image, *, max_w: int, max_h: int, radius: int) -> Image.Image:
	shot = shot.convert("RGBA")
	shot.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
	bezel = 10
	outer_w = shot.width + bezel * 2
	outer_h = shot.height + bezel * 2
	outer = Image.new("RGBA", (outer_w, outer_h), (0, 0, 0, 0))
	mask = rounded_mask((outer_w, outer_h), radius)
	phone = Image.new("RGBA", shot.size, (0, 0, 0, 255))
	inner = rounded_mask(shot.size, max(8, radius - bezel))
	phone.paste(shot, (0, 0), inner)
	outer.paste(phone, (bezel, bezel), phone)
	outline = Image.new("RGBA", (outer_w, outer_h), (0, 0, 0, 0))
	ImageDraw.Draw(outline).rounded_rectangle(
		(0, 0, outer_w - 1, outer_h - 1),
		radius=radius,
		outline=HYPER,
		width=3,
	)
	outer = Image.alpha_composite(outer, outline)
	outer.putalpha(mask)
	return outer


def drop_shadow(img: Image.Image, *, radius: int = 32, offset: tuple[int, int] = (0, 22)) -> Image.Image:
	ox, oy = offset
	pad = radius * 2 + max(abs(ox), abs(oy))
	canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
	shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
	s = Image.new("L", img.size, 0)
	s.paste(img.split()[-1], (0, 0))
	shadow_layer = Image.new("RGBA", img.size, (0, 0, 0, 170))
	shadow_layer.putalpha(s)
	shadow.paste(shadow_layer, (pad + ox, pad + oy), shadow_layer)
	shadow = shadow.filter(ImageFilter.GaussianBlur(radius=radius))
	canvas = Image.alpha_composite(canvas, shadow)
	canvas.paste(img, (pad, pad), img)
	return canvas


def tilt(img: Image.Image, angle: float) -> Image.Image:
	return img.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)


def soft_glow(size: tuple[int, int], *, y_frac: float = 0.42) -> Image.Image:
	glow = Image.new("RGBA", size, (0, 0, 0, 0))
	g = ImageDraw.Draw(glow)
	cx, cy = size[0] // 2, int(size[1] * y_frac)
	r = int(min(size) * 0.42)
	g.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(0, 224, 136, 48))
	return glow.filter(ImageFilter.GaussianBlur(radius=96))


def caption_font(draw: ImageDraw.ImageDraw, text: str, size: DisplaySize, max_width: int) -> ImageFont.ImageFont:
	for px in range(size.caption_font, 28, -2):
		font = load_font(px)
		widths = [draw.textlength(line, font=font) for line in text.split("\n")]
		if max(widths) <= max_width:
			return font
	return load_font(28)


def draw_caption(canvas: Image.Image, text: str, size: DisplaySize) -> int:
	"""Draw caption; return y just below the underline."""
	draw = ImageDraw.Draw(canvas)
	max_width = int(size.width * 0.9)
	font = caption_font(draw, text, size, max_width)
	lines = text.split("\n")
	line_gap = 14
	ascent, descent = font.getmetrics()
	widths = [draw.textlength(line, font=font) for line in lines]
	baseline = size.caption_top + ascent
	last_bottom = baseline
	for i, line in enumerate(lines):
		x = int((size.width - widths[i]) // 2)
		draw.text((x, baseline), line, font=font, fill=WHITE)
		bbox = draw.textbbox((x, baseline), line, font=font)
		last_bottom = bbox[3]
		baseline += ascent + descent + line_gap
	uw = min(320, int(max(widths) if widths else 200))
	ux = (size.width - uw) // 2
	uy = last_bottom + 22
	draw.rounded_rectangle((ux, uy, ux + uw, uy + 6), radius=3, fill=HYPER)
	return uy + 18


def draw_chips(canvas: Image.Image, chips: tuple[str, ...], size: DisplaySize, top: int) -> int:
	if not chips:
		return top
	draw = ImageDraw.Draw(canvas)
	font = load_font(size.chip_font)
	gap = 12
	pads = (18, 10)
	widths: list[int] = []
	for chip in chips:
		tw = int(draw.textlength(chip, font=font))
		widths.append(tw + pads[0] * 2)
	total = sum(widths) + gap * (len(chips) - 1)
	x = (size.width - total) // 2
	h = size.chip_font + pads[1] * 2
	for chip, cw in zip(chips, widths, strict=True):
		draw.rounded_rectangle((x, top, x + cw, top + h), radius=h // 2, outline=HYPER, width=2)
		tx = x + (cw - draw.textlength(chip, font=font)) / 2
		draw.text((tx, top + pads[1] - 2), chip, font=font, fill=HYPER)
		x += cw + gap
	return top + h + 20


def draw_wordmark(canvas: Image.Image, size: DisplaySize) -> None:
	draw = ImageDraw.Draw(canvas)
	font = load_font(size.wordmark_font)
	label = "RATION"
	bbox = draw.textbbox((0, 0), label, font=font)
	tw = bbox[2] - bbox[0]
	x = (size.width - tw) // 2
	y = size.height - int(size.height * 0.038)
	draw.text((x, y), label, font=font, fill=HYPER)


def prepare_shot(spec: FrameSpec, source: str, crop: tuple[float, float, float, float]) -> Image.Image:
	shot = crop_rel(open_rgb(source), crop)
	shot = cover_rects(shot, spec.cover_rects if source == spec.source else ())
	if spec.hide_testflight and crop[1] < 0.04:
		shot = hide_testflight(shot, spec.dark_ui)
	return shot


def place_centered(base: Image.Image, overlay: Image.Image, *, top: int, bottom: int) -> None:
	avail_h = max(40, bottom - top)
	avail_w = base.width
	fitted = overlay.copy()
	fitted.thumbnail((int(avail_w * 0.92), avail_h), Image.Resampling.LANCZOS)
	dx = (base.width - fitted.width) // 2
	dy = top + max(0, (avail_h - fitted.height) // 2)
	base.paste(fitted, (dx, dy), fitted)


def compose_zoom(spec: FrameSpec, size: DisplaySize, base: Image.Image, caption_bottom: int) -> None:
	shot = prepare_shot(spec, spec.source, spec.crop)
	max_h = int(size.height * 0.72)
	max_w = int(size.width * 0.92)
	device = phone_bezel(shot, max_w=max_w, max_h=max_h, radius=size.device_radius)
	device = drop_shadow(device)
	wordmark_top = size.height - int(size.height * 0.055)
	place_centered(base, device, top=caption_bottom, bottom=wordmark_top)
	if spec.secondary and spec.layout == "zoom":
		inset = crop_rel(open_rgb(spec.secondary), spec.secondary_crop)
		card_h = int(size.height * 0.28)
		card_w = int(size.width * 0.46)
		card = phone_bezel(inset, max_w=card_w, max_h=card_h, radius=max(24, size.device_radius - 20))
		card = drop_shadow(card, radius=18, offset=(8, 14))
		cx = size.width - card.width + int(size.width * 0.02)
		cy = wordmark_top - card.height + 12
		cx = min(cx, size.width - int(card.width * 0.78))
		cy = max(caption_bottom + 48, cy)
		base.paste(card, (cx, cy), card)


def compose_device(spec: FrameSpec, size: DisplaySize, base: Image.Image, caption_bottom: int) -> None:
	shot = prepare_shot(spec, spec.source, spec.crop)
	max_h = int(size.height * 0.70)
	max_w = int(size.width * 0.86)
	device = phone_bezel(shot, max_w=max_w, max_h=max_h, radius=size.device_radius)
	device = drop_shadow(device)
	wordmark_top = size.height - int(size.height * 0.055)
	place_centered(base, device, top=caption_bottom, bottom=wordmark_top)


def compose_social(spec: FrameSpec, size: DisplaySize, base: Image.Image, caption_bottom: int) -> None:
	share = prepare_shot(spec, spec.source, spec.crop)
	hero_h = int(size.height * 0.62)
	hero_w = int(size.width * 0.78)
	hero = phone_bezel(share, max_w=hero_w, max_h=hero_h, radius=size.device_radius)
	hero = tilt(drop_shadow(hero, radius=28, offset=(12, 28)), -7)

	card = None
	if spec.secondary:
		imp = crop_rel(open_rgb(spec.secondary), spec.secondary_crop)
		card_h = int(size.height * 0.32)
		card_w = int(size.width * 0.48)
		card = phone_bezel(imp, max_w=card_w, max_h=card_h, radius=max(28, size.device_radius - 16))
		card = tilt(drop_shadow(card, radius=22, offset=(-8, 18)), 8)

	wordmark_top = size.height - int(size.height * 0.055)
	# Hero left-of-centre; import card overlaps lower-right.
	hx = int(size.width * 0.02)
	hy = caption_bottom + int(size.height * 0.01)
	# Scale if needed to fit remaining height
	room_h = wordmark_top - hy
	if hero.height > room_h:
		hero.thumbnail((hero.width, room_h), Image.Resampling.LANCZOS)
	base.paste(hero, (hx, hy), hero)
	if card is not None:
		cx = size.width - card.width + int(size.width * 0.04)
		cy = wordmark_top - card.height + 8
		cx = max(int(size.width * 0.38), min(cx, size.width - int(card.width * 0.82)))
		cy = max(caption_bottom + 40, cy)
		base.paste(card, (cx, cy), card)


def compose_split(spec: FrameSpec, size: DisplaySize, base: Image.Image, caption_bottom: int) -> None:
	dark = prepare_shot(spec, spec.source, spec.crop)
	light_src = spec.light_source or spec.source
	light_crop = spec.light_crop or spec.crop
	light = crop_rel(open_rgb(light_src), light_crop)
	if spec.hide_testflight and light_crop[1] < 0.04:
		light = hide_testflight(light, dark=False)
	# Match sizes
	target = (min(dark.width, light.width), min(dark.height, light.height))
	dark = dark.resize(target, Image.Resampling.LANCZOS)
	light = light.resize(target, Image.Resampling.LANCZOS)
	mask = Image.new("L", target, 0)
	w, h = target
	ImageDraw.Draw(mask).polygon([(0, h), (w, 0), (w, h)], fill=255)
	split = light.copy()
	split.paste(dark, (0, 0), mask)
	max_h = int(size.height * 0.70)
	max_w = int(size.width * 0.90)
	device = phone_bezel(split, max_w=max_w, max_h=max_h, radius=size.device_radius)
	device = drop_shadow(device)
	wordmark_top = size.height - int(size.height * 0.055)
	place_centered(base, device, top=caption_bottom, bottom=wordmark_top)


def compose(spec: FrameSpec, size: DisplaySize) -> None:
	base = Image.new("RGBA", (size.width, size.height), CARBON)
	base = Image.alpha_composite(base, soft_glow((size.width, size.height)))
	y = draw_caption(base, spec.caption, size)
	y = draw_chips(base, spec.chips, size, y)
	if spec.layout == "zoom":
		compose_zoom(spec, size, base, y)
	elif spec.layout == "device":
		compose_device(spec, size, base, y)
	elif spec.layout == "social":
		compose_social(spec, size, base, y)
	elif spec.layout == "split":
		compose_split(spec, size, base, y)
	else:
		raise ValueError(spec.layout)
	draw_wordmark(base, size)
	out = base.convert("RGB")
	out_dir = FRAMED / size.label
	out_dir.mkdir(parents=True, exist_ok=True)
	dest = out_dir / f"{spec.stem}.png"
	out.save(dest, format="PNG", optimize=True)
	assert out.size == (size.width, size.height), out.size
	print(f"wrote {dest.relative_to(ROOT)} ({out.size[0]}×{out.size[1]})")


def main() -> None:
	for size in SIZES:
		out_dir = FRAMED / size.label
		out_dir.mkdir(parents=True, exist_ok=True)
		for stale in out_dir.glob("*.png"):
			stale.unlink()
		for spec in FRAMES:
			compose(spec, size)
	print("done")


if __name__ == "__main__":
	main()
