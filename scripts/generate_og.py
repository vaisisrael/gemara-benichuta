#!/usr/bin/env python3
"""Generate Open Graph share images for Gemara Benichuta lessons.

Reads lesson metadata from content/lessons/*.md and creates images in assets/og/.
This script uses Pillow. In GitHub Actions install it with:

    python -m pip install Pillow

Recommended font package on Ubuntu:

    sudo apt-get install -y fonts-noto-core
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Missing dependency: Pillow. Install with: python -m pip install Pillow"
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
LESSONS_DIR = ROOT / "content" / "lessons"
OG_DIR = ROOT / "assets" / "og"
ICON_CANDIDATES = [
    ROOT / "assets" / "icons" / "logo.png",
    ROOT / "assets" / "icons" / "logo.webp",
    ROOT / "assets" / "icons" / "profile.png",
    ROOT / "assets" / "icons" / "favicon.png",
]

WIDTH = 1200
HEIGHT = 630

BG = "#FAF7F0"
GREEN = "#3F5F4A"
GREEN_DARK = "#2F4638"
GOLD = "#C9A86A"
TEXT = "#1F2933"
CREAM = "#FFFDF6"


def parse_frontmatter(text: str) -> dict[str, str]:
    text = text.replace("\r\n", "\n")
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?", text, flags=re.S)
    if not match:
        return {}

    meta: dict[str, str] = {}
    for line in match.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        meta[key.strip()] = value
    return meta


def find_font(preferred_names: Iterable[str], fallback_size: int):
    search_dirs = [
        Path("/usr/share/fonts/truetype/noto"),
        Path("/usr/share/fonts/opentype/noto"),
        Path("/usr/share/fonts/truetype/dejavu"),
        Path("/System/Library/Fonts"),
        Path("/Library/Fonts"),
        Path("C:/Windows/Fonts"),
    ]

    for directory in search_dirs:
        if not directory.exists():
            continue
        for preferred in preferred_names:
            for path in directory.rglob(preferred):
                try:
                    return ImageFont.truetype(str(path), fallback_size)
                except OSError:
                    pass

    try:
        return ImageFont.truetype("DejaVuSans.ttf", fallback_size)
    except OSError:
        return ImageFont.load_default()


def font(size: int, bold: bool = False):
    if bold:
        return find_font(
            [
                "NotoSansHebrew-Bold.ttf",
                "NotoSansHebrew_Condensed-Bold.ttf",
                "NotoSans-Bold.ttf",
                "DejaVuSans-Bold.ttf",
            ],
            size,
        )
    return find_font(
        [
            "NotoSansHebrew-Regular.ttf",
            "NotoSansHebrew_Condensed-Regular.ttf",
            "NotoSans-Regular.ttf",
            "DejaVuSans.ttf",
        ],
        size,
    )


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=fnt)
    return int(bbox[2] - bbox[0]), int(bbox[3] - bbox[1])


def draw_rtl(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    fnt,
    fill: str,
    anchor: str = "ra",
) -> None:
    try:
        draw.text(xy, text, font=fnt, fill=fill, anchor=anchor, direction="rtl", language="he")
    except Exception:
        draw.text(xy, text, font=fnt, fill=fill, anchor=anchor)


def wrap_rtl(draw: ImageDraw.ImageDraw, text: str, fnt, max_width: int) -> list[str]:
    words = text.split()
    if not words:
        return []

    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = current + " " + word
        width, _ = text_size(draw, candidate, fnt)
        if width <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def rounded_rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill: str, outline: str | None = None, width: int = 1) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def load_icon(size: int = 96) -> Image.Image | None:
    for path in ICON_CANDIDATES:
        if path.exists():
            try:
                icon = Image.open(path).convert("RGBA")
                icon.thumbnail((size, size), Image.LANCZOS)
                canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
                x = (size - icon.width) // 2
                y = (size - icon.height) // 2
                canvas.alpha_composite(icon, (x, y))
                return canvas
            except Exception:
                continue
    return None


def draw_fallback_icon(img: Image.Image, x: int, y: int, size: int) -> None:
    draw = ImageDraw.Draw(img)
    rounded_rect(draw, (x, y, x + size, y + size), 22, GREEN, GOLD, 4)
    alef_font = font(int(size * 0.58), bold=True)
    draw.text((x + size // 2, y + int(size * 0.55)), "ג", font=alef_font, fill=CREAM, anchor="mm")
    draw.line((x + 24, y + size - 28, x + size - 24, y + size - 28), fill=GOLD, width=5)


def make_og_image(meta: dict[str, str]) -> Image.Image:
    lesson_number = meta.get("lesson_number", "").strip()
    title = meta.get("title", "").strip()
    tractate = meta.get("tractate", "").strip()
    daf = meta.get("daf", "").strip()
    amud = meta.get("amud", "").strip()

    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    draw.ellipse((-260, -220, 360, 380), fill="#EEF0E6")
    draw.ellipse((930, -210, 1380, 260), fill="#F2E8D5")
    draw.ellipse((920, 360, 1370, 810), fill="#EFE2C8")
    draw.arc((-220, 390, 420, 1030), 205, 335, fill="#E6D7B6", width=4)
    draw.arc((-170, 430, 380, 980), 205, 335, fill="#EBDDBE", width=3)

    margin = 62
    rounded_rect(draw, (margin, 54, WIDTH - margin, HEIGHT - 54), 42, CREAM, GOLD, 5)

    icon_size = 92
    icon_x = WIDTH - margin - icon_size - 28
    icon_y = 78
    icon = load_icon(icon_size)
    if icon:
        img_rgba = img.convert("RGBA")
        img_rgba.alpha_composite(icon, (icon_x, icon_y))
        img = img_rgba.convert("RGB")
        draw = ImageDraw.Draw(img)
    else:
        draw_fallback_icon(img, icon_x, icon_y, icon_size)

    brand_font = font(30, bold=True)
    draw_rtl(draw, (icon_x - 24, icon_y + 56), "גמרא למתחילים בניחותא", brand_font, GREEN_DARK)

    lesson_font = font(92, bold=True)
    lesson_text = f"שיעור {lesson_number}" if lesson_number else "שיעור"
    draw_rtl(draw, (WIDTH - margin - 56, 225), lesson_text, lesson_font, GREEN_DARK)

    banner_left = margin + 58
    banner_right = WIDTH - margin - 58
    banner_top = 270
    banner_bottom = 396
    rounded_rect(draw, (banner_left, banner_top, banner_right, banner_bottom), 22, GREEN_DARK)

    title_font_size = 46
    title_font = font(title_font_size, bold=True)
    lines = wrap_rtl(draw, title, title_font, banner_right - banner_left - 60)
    if len(lines) > 2:
        title_font_size = 40
        title_font = font(title_font_size, bold=True)
        lines = wrap_rtl(draw, title, title_font, banner_right - banner_left - 60)[:2]

    line_h = title_font_size + 10
    total_h = len(lines) * line_h
    y = banner_top + (banner_bottom - banner_top - total_h) // 2 + title_font_size
    for line in lines:
        draw_rtl(draw, (banner_right - 32, y), line, title_font, CREAM)
        y += line_h

    source = " · ".join(part for part in [tractate, f"דף {daf}" if daf else "", f"עמוד {amud}" if amud else ""] if part)
    source_font = font(42, bold=False)
    draw_rtl(draw, (WIDTH // 2 + 250, 472), source, source_font, TEXT)

    draw.line((260, 520, 940, 520), fill=GOLD, width=3)
    draw.polygon([(WIDTH // 2, 508), (WIDTH // 2 + 12, 520), (WIDTH // 2, 532), (WIDTH // 2 - 12, 520)], fill=GOLD)

    footer_font = font(24, bold=False)
    draw_rtl(draw, (WIDTH - margin - 58, 565), "לימוד תלמוד וגמרא מן המקור — צעד אחר צעד", footer_font, GREEN_DARK)

    return img


def generate_all() -> None:
    if not LESSONS_DIR.exists():
        print(f"No lesson directory found: {LESSONS_DIR}")
        return

    OG_DIR.mkdir(parents=True, exist_ok=True)

    for lesson_path in sorted(LESSONS_DIR.glob("*.md")):
        if lesson_path.name.upper() == "README.MD":
            continue

        meta = parse_frontmatter(lesson_path.read_text(encoding="utf-8"))
        lesson_number = meta.get("lesson_number", "").strip()
        if not lesson_number:
            continue

        out_path = OG_DIR / f"{lesson_number}.webp"
        image = make_og_image(meta)
        image.save(out_path, "WEBP", quality=92, method=6)
        print(f"Generated {out_path.relative_to(ROOT)}")


def main() -> None:
    generate_all()


if __name__ == "__main__":
    main()
