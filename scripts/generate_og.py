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
except ImportError as exc:
    raise SystemExit(
        "Missing dependency: Pillow. Install with: python -m pip install Pillow"
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
LESSONS_DIR = ROOT / "content" / "lessons"
OG_DIR = ROOT / "assets" / "og"

ICON_CANDIDATES = [
    ROOT / "assets" / "icons" / "logo.png",
    ROOT / "assets" / "icons" / "icon-512.png",
    ROOT / "assets" / "icons" / "icon-192.png",
    ROOT / "assets" / "icons" / "apple-touch-icon.png",
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


def find_font(preferred_names: Iterable[str], size: int):
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
                    return ImageFont.truetype(str(path), size)
                except OSError:
                    pass

    try:
        return ImageFont.truetype("DejaVuSans.ttf", size)
    except OSError:
        return ImageFont.load_default()


def font(size: int, bold: bool = False):
    if bold:
        return find_font(
            [
                "NotoSansHebrew-Bold.ttf",
                "NotoSans-Bold.ttf",
                "DejaVuSans-Bold.ttf",
            ],
            size,
        )

    return find_font(
        [
            "NotoSansHebrew-Regular.ttf",
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
        draw.text(
            xy,
            text,
            font=fnt,
            fill=fill,
            anchor=anchor,
            direction="rtl",
            language="he",
        )
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


def clean_display_text(text: str) -> str:
    """Avoid punctuation that may render badly in generated images."""
    return (
        text.replace(":", " ")
        .replace("·", " ")
        .replace("—", " ")
        .replace("–", " ")
        .replace("|", " ")
        .replace("  ", " ")
        .strip()
    )


def rounded_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int,
    fill: str,
    outline: str | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def load_icon(size: int = 86) -> Image.Image | None:
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
    rounded_rect(draw, (x, y, x + size, y + size), 18, GREEN, GOLD, 4)
    glyph_font = font(int(size * 0.58), bold=True)
    draw.text((x + size // 2, y + int(size * 0.55)), "ג", font=glyph_font, fill=CREAM, anchor="mm")
    draw.line((x + 24, y + size - 24, x + size - 24, y + size - 24), fill=GOLD, width=4)


def make_og_image(meta: dict[str, str]) -> Image.Image:
    lesson_number = clean_display_text(meta.get("lesson_number", "").strip())
    title = clean_display_text(meta.get("title", "").strip())
    tractate = clean_display_text(meta.get("tractate", "").strip())
    daf = clean_display_text(meta.get("daf", "").strip())
    amud = clean_display_text(meta.get("amud", "").strip())

    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    # Soft background shapes.
    draw.ellipse((-250, -240, 360, 360), fill="#EEF0E6")
    draw.ellipse((940, -220, 1370, 250), fill="#F2E8D5")
    draw.ellipse((900, 370, 1380, 820), fill="#EFE2C8")

    margin = 62
    rounded_rect(draw, (margin, 54, WIDTH - margin, HEIGHT - 54), 42, CREAM, GOLD, 5)

    # Icon.
    icon_size = 86
    icon_x = WIDTH - margin - icon_size - 28
    icon_y = 82
    icon = load_icon(icon_size)

    if icon:
        img_rgba = img.convert("RGBA")
        img_rgba.alpha_composite(icon, (icon_x, icon_y))
        img = img_rgba.convert("RGB")
        draw = ImageDraw.Draw(img)
    else:
        draw_fallback_icon(img, icon_x, icon_y, icon_size)

    # Brand line.
    brand_font = font(30, bold=True)
    draw_rtl(
        draw,
        (icon_x - 26, icon_y + 52),
        "גמרא למתחילים בניחותא",
        brand_font,
        GREEN_DARK,
    )

    # Lesson number.
    lesson_font = font(78, bold=True)
    lesson_text = f"שיעור {lesson_number}" if lesson_number else "שיעור"
    draw_rtl(draw, (WIDTH - margin - 58, 230), lesson_text, lesson_font, GREEN_DARK)

    # Title banner.
    banner_left = margin + 54
    banner_right = WIDTH - margin - 54
    banner_top = 284
    banner_bottom = 396
    rounded_rect(draw, (banner_left, banner_top, banner_right, banner_bottom), 22, GREEN_DARK)

    title_font_size = 42
    title_font = font(title_font_size, bold=True)
    lines = wrap_rtl(draw, title, title_font, banner_right - banner_left - 64)

    if len(lines) > 2:
        title_font_size = 36
        title_font = font(title_font_size, bold=True)
        lines = wrap_rtl(draw, title, title_font, banner_right - banner_left - 64)[:2]

    line_h = title_font_size + 8
    total_h = len(lines) * line_h
    y = banner_top + (banner_bottom - banner_top - total_h) // 2 + title_font_size

    for line in lines:
        draw_rtl(draw, (banner_right - 32, y), line, title_font, CREAM)
        y += line_h

    # Source line.
    source_parts = []
    if tractate:
        source_parts.append(tractate)
    if daf:
        source_parts.append(f"דף {daf}")
    if amud:
        source_parts.append(f"עמוד {amud}")

    source = "   ".join(source_parts)
    source_font = font(38, bold=False)
    draw_rtl(draw, (WIDTH - margin - 58, 475), source, source_font, TEXT)

    # Accent line.
    draw.line((270, 520, 930, 520), fill=GOLD, width=3)

    # Footer.
    footer_font = font(24, bold=False)
    draw_rtl(
        draw,
        (WIDTH - margin - 58, 565),
        "לימוד תלמוד וגמרא מן המקור צעד אחר צעד",
        footer_font,
        GREEN_DARK,
    )

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
