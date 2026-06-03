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
PANEL = "#FFFDF6"
GREEN = "#3F5F4A"
GREEN_DARK = "#2F4638"
GOLD = "#C9A86A"
TEXT = "#1F2933"
MUTED = "#4B5563"


HEBREW_ONES_MASC = {
    1: "ראשון",
    2: "שני",
    3: "שלישי",
    4: "רביעי",
    5: "חמישי",
    6: "שישי",
    7: "שביעי",
    8: "שמיני",
    9: "תשיעי",
}

HEBREW_TEENS_MASC = {
    10: "עשירי",
    11: "אחד עשר",
    12: "שנים עשר",
    13: "שלושה עשר",
    14: "ארבעה עשר",
    15: "חמישה עשר",
    16: "שישה עשר",
    17: "שבעה עשר",
    18: "שמונה עשר",
    19: "תשעה עשר",
}

HEBREW_TENS = {
    20: "עשרים",
    30: "שלושים",
    40: "ארבעים",
    50: "חמישים",
    60: "שישים",
    70: "שבעים",
    80: "שמונים",
    90: "תשעים",
}


def lesson_number_to_hebrew_words(value: str) -> str:
    """Convert lesson number like 003 or 032 to Hebrew display text."""
    try:
        number = int(value)
    except ValueError:
        return f"שיעור {value}"

    if number <= 0:
        return f"שיעור {value}"

    if number in HEBREW_ONES_MASC:
        return f"שיעור {HEBREW_ONES_MASC[number]}"

    if number in HEBREW_TEENS_MASC:
        return f"שיעור {HEBREW_TEENS_MASC[number]}"

    if number in HEBREW_TENS:
        return f"שיעור {HEBREW_TENS[number]}"

    if 21 <= number <= 99:
        tens = (number // 10) * 10
        ones = number % 10
        return f"שיעור {HEBREW_TENS[tens]} ו{HEBREW_ONES_MASC[ones]}"

    return f"שיעור {number}"


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
    return (
        text.replace(":", " ")
        .replace("·", " ")
        .replace("—", " ")
        .replace("–", " ")
        .replace("|", " ")
        .replace("/", " ")
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
    draw.text((x + size // 2, y + int(size * 0.55)), "ג", font=glyph_font, fill=PANEL, anchor="mm")
    draw.line((x + 24, y + size - 24, x + size - 24, y + size - 24), fill=GOLD, width=4)


def fit_title_lines(
    draw: ImageDraw.ImageDraw,
    title: str,
    max_width: int,
    max_lines: int = 2,
    start_size: int = 50,
    min_size: int = 34,
):
    size = start_size

    while size >= min_size:
        fnt = font(size, bold=True)
        lines = wrap_rtl(draw, title, fnt, max_width)
        if len(lines) <= max_lines:
            return lines, fnt, size
        size -= 2

    fnt = font(min_size, bold=True)
    lines = wrap_rtl(draw, title, fnt, max_width)

    if len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while text_size(draw, last + "...", fnt)[0] > max_width and len(last) > 3:
            last = last[:-1].strip()
        lines[-1] = last + "..."

    return lines, fnt, min_size


def make_og_image(meta: dict[str, str]) -> Image.Image:
    lesson_number = meta.get("lesson_number", "").strip()
    lesson_text = lesson_number_to_hebrew_words(lesson_number)

    title = clean_display_text(meta.get("title", "").strip())
    tractate = clean_display_text(meta.get("tractate", "").strip())
    daf = clean_display_text(meta.get("daf", "").strip())
    amud = clean_display_text(meta.get("amud", "").strip())

    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    # Gentle background.
    draw.ellipse((-250, -240, 360, 360), fill="#EEF0E6")
    draw.ellipse((930, -220, 1370, 250), fill="#F2E8D5")
    draw.ellipse((900, 370, 1380, 820), fill="#EFE2C8")

    # Main panel.
    margin = 64
    panel_box = (margin, 58, WIDTH - margin, HEIGHT - 58)
    rounded_rect(draw, panel_box, 42, PANEL, GOLD, 5)

    right = WIDTH - margin - 56
    left = margin + 56

    # Icon + brand.
    icon_size = 82
    icon_x = right - icon_size
    icon_y = 88
    icon = load_icon(icon_size)

    if icon:
        img_rgba = img.convert("RGBA")
        img_rgba.alpha_composite(icon, (icon_x, icon_y))
        img = img_rgba.convert("RGB")
        draw = ImageDraw.Draw(img)
    else:
        draw_fallback_icon(img, icon_x, icon_y, icon_size)

    brand_font = font(30, bold=True)
    draw_rtl(
        draw,
        (icon_x - 26, icon_y + 52),
        "גמרא למתחילים בניחותא",
        brand_font,
        GREEN_DARK,
    )

    # Lesson number in Hebrew words, to avoid digit-rendering issues.
    lesson_font = font(56, bold=True)
    draw_rtl(draw, (right, 245), lesson_text, lesson_font, GREEN_DARK)

    # Title, no overlay, no banner.
    title_lines, title_font, title_size = fit_title_lines(
        draw,
        title,
        max_width=860,
        max_lines=2,
        start_size=50,
        min_size=34,
    )

    y = 330
    line_h = title_size + 16

    for line in title_lines:
        draw_rtl(draw, (right, y), line, title_font, TEXT)
        y += line_h

    # Source line: no slashes, dots, or separators that may render as squares.
    source_parts = []
    if tractate:
        source_parts.append(tractate)
    if daf:
        source_parts.append(f"דף {daf}")
    if amud:
        source_parts.append(f"עמוד {amud}")

    source = " ".join(source_parts)
    source_font = font(36, bold=False)
    draw_rtl(draw, (right, 485), source, source_font, MUTED)

    # Accent line and footer.
    draw.line((left, 525, right, 525), fill=GOLD, width=3)

    footer_font = font(24, bold=False)
    draw_rtl(
        draw,
        (right, 568),
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
