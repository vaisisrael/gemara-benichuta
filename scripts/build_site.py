#!/usr/bin/env python3
"""Build the static Gemara Benichuta site from Markdown lesson sources.

Source of truth for Hebrew lessons: content/lessons/*.md
Generated public lesson pages: he/lessons/*.html inside the build output.

The script intentionally uses only Python standard-library modules, so it can run
inside GitHub Actions without installing dependencies.

Optional: if scripts/generate_og.py and Pillow are available, the build also
generates Open Graph images for lesson links.
"""

from __future__ import annotations

import html
import os
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
LEGACY_BASE_PATH = "/gemara-benichuta"


def normalize_base_path(value: str) -> str:
    """Normalize the Pages base path supplied by GitHub Actions.

    Default GitHub project URL: /gemara-benichuta
    Custom domain: empty string
    """
    value = value.strip()
    if not value or value == "/":
        return ""
    if not value.startswith("/"):
        value = "/" + value
    return value.rstrip("/")


BASE_PATH = normalize_base_path(
    os.environ.get("SITE_BASE_PATH", LEGACY_BASE_PATH)
)
SITE_NAME = "גמרא למתחילים בניחותא"
SITE_SUBTITLE = "לימוד תלמוד וגמרא מן המקור — צעד אחר צעד"
WHATSAPP_CHANNEL_URL = "https://whatsapp.com/channel/0029VbCtpPOB4hdMMUaLUb0h"
GA_MEASUREMENT_ID = "G-BBYFSSTE1Z"

GLOSSARY_PATH = ROOT / "he" / "מילון.md"

NAV_ITEMS = [
    ("בית", f"{BASE_PATH}/he/"),
    ("שיעורים", f"{BASE_PATH}/he/lessons/"),
    ("איך לומדים כאן?", f"{BASE_PATH}/he/how-to-learn.html"),
    ("אודות", f"{BASE_PATH}/he/about.html"),
]

HEADING_IDS = {
    "איפה אנחנו?": "where",
    "מה צריך לדעת לפני שנכנסים?": "before",
    "לשון המקור": "source",
    "במילים פשוטות": "simple",
    "איך הסוגיה חושבת?": "thinking",
    "פוגשים את הדף": "daf",
    "מושגים חדשים": "concepts",
    "מה נשאר ביד": "takeaway",
}


@dataclass
class Lesson:
    meta: dict[str, str]
    body: str
    html_body: str
    toc: list[tuple[str, str]]


@dataclass
class GlossaryEntry:
    id: str
    word: str
    definition: str


def clean_dist() -> None:
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)


def copy_if_exists(src: Path, dst: Path) -> None:
    if not src.exists():
        return
    if src.is_dir():
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def copy_static_site() -> None:
    # Copy the existing static shell first. Generated lesson pages overwrite it.
    for name in ["index.html", "assets", "he", "en", "manifest.webmanifest", "service-worker.js"]:
        copy_if_exists(ROOT / name, DIST / name)


def rewrite_static_base_paths() -> None:
    """Adapt copied static files to the active GitHub Pages base path.

    Some hand-written files still contain the former project path
    /gemara-benichuta. On the custom domain, GitHub serves the site from /,
    so those references must become root-relative. When the site is served
    from the original GitHub project URL, this is intentionally a no-op.
    """
    text_suffixes = {
        ".html",
        ".css",
        ".js",
        ".json",
        ".webmanifest",
        ".xml",
        ".txt",
    }

    for path in DIST.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in text_suffixes:
            continue

        try:
            original = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue

        updated = original.replace(LEGACY_BASE_PATH, BASE_PATH)
        if updated != original:
            path.write_text(updated, encoding="utf-8")


def strip_markdown_bold(value: str) -> str:
    value = value.strip()
    if value.startswith("**") and value.endswith("**") and len(value) >= 4:
        return value[2:-2].strip()
    return value


def load_glossary() -> dict[str, GlossaryEntry]:
    """Load he/מילון.md.

    Expected table format:
    | ID | מילה | פירוש |
    |---:|---|---|
    | 8 | **דְּאִיכָּא** | שיש |

    IDs are stable and must not be changed after being assigned.
    """
    glossary: dict[str, GlossaryEntry] = {}

    if not GLOSSARY_PATH.exists():
        print(f"Warning: glossary file not found: {GLOSSARY_PATH}")
        return glossary

    text = GLOSSARY_PATH.read_text(encoding="utf-8")

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line.startswith("|") or "---" in line:
            continue

        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) < 3:
            continue

        if cells[0] == "ID":
            continue

        entry_id = cells[0].strip()
        word = strip_markdown_bold(cells[1])
        definition = cells[2].strip()

        if not entry_id or not entry_id.isdigit() or not word or not definition:
            continue

        glossary[entry_id] = GlossaryEntry(
            id=entry_id,
            word=word,
            definition=definition,
        )

    return glossary


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    text = text.replace("\r\n", "\n")
    if not text.startswith("---"):
        return {}, text.strip()

    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, flags=re.S)
    if not match:
        parts = text.split("---", 2)
        if len(parts) >= 3:
            raw_meta, body = parts[1], parts[2]
        else:
            return {}, text.strip()
    else:
        raw_meta, body = match.group(1), match.group(2)

    meta: dict[str, str] = {}
    for line in raw_meta.splitlines():
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
    return meta, body.strip()


def slugify_heading(text: str, used: set[str]) -> str:
    base = HEADING_IDS.get(text)
    if not base:
        base = re.sub(r"[^A-Za-z0-9א-ת]+", "-", text).strip("-") or "section"
    slug = base
    counter = 2
    while slug in used:
        slug = f"{base}-{counter}"
        counter += 1
    used.add(slug)
    return slug


def render_glossary_marker(
    word: str,
    entry_id: str,
    glossary: dict[str, GlossaryEntry],
) -> str:
    entry = glossary.get(entry_id)

    if not entry:
        print(f"Warning: glossary ID {entry_id} was used for '{word}', but was not found.")
        return html.escape(word, quote=False)

    escaped_word = html.escape(word, quote=False)
    escaped_id = html.escape(entry.id, quote=True)
    escaped_entry_word = html.escape(entry.word, quote=True)
    escaped_definition = html.escape(entry.definition, quote=True)
    aria_label = html.escape(f"{entry.word}: {entry.definition}", quote=True)

    return (
        '<span class="glossary-term" '
        f'data-glossary-id="{escaped_id}" '
        f'data-glossary-word="{escaped_entry_word}" '
        f'data-tooltip="{escaped_definition}" '
        f'title="{escaped_definition}" '
        'tabindex="0" '
        f'aria-label="{aria_label}">'
        f"{escaped_word}"
        "</span>"
    )


def inline_markdown(text: str, glossary: dict[str, GlossaryEntry] | None = None) -> str:
    glossary = glossary or {}
    placeholders: list[str] = []

    def stash(value: str) -> str:
        placeholders.append(value)
        return f"\u0000{len(placeholders)-1}\u0000"

    # Glossary markers are explicit only:
    # דְּאִיכָּא{8} -> span with tooltip.
    # A word without {ID} is never linked automatically, even if it exists in the glossary.
    glossary_pattern = re.compile(r"([^\s{}<>()[\],.;:!?״\"']+)\{(\d+)\}")

    text = glossary_pattern.sub(
        lambda m: stash(render_glossary_marker(m.group(1), m.group(2), glossary)),
        text,
    )

    text = html.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", lambda m: stash(f"<code>{m.group(1)}</code>"), text)
    text = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda m: stash(
            f'<a href="{html.escape(m.group(2), quote=True)}">{m.group(1)}</a>'
        ),
        text,
    )
    text = re.sub(r"\*\*(.+?)\*\*", lambda m: stash(f"<strong>{m.group(1)}</strong>"), text)

    for i, value in enumerate(placeholders):
        text = text.replace(f"\u0000{i}\u0000", value)
    return text


def split_blocks(markdown: str) -> list[str]:
    lines = markdown.replace("\r\n", "\n").split("\n")
    blocks: list[str] = []
    current: list[str] = []
    mode: str | None = None

    def flush() -> None:
        nonlocal current, mode
        if current:
            blocks.append("\n".join(current).strip())
        current = []
        mode = None

    for line in lines:
        stripped = line.strip()
        if not stripped:
            flush()
            continue
        new_mode = "plain"
        if stripped.startswith(">"):
            new_mode = "quote"
        elif re.match(r"^[-*]\s+", stripped):
            new_mode = "ul"
        elif re.match(r"^\d+\.\s+", stripped):
            new_mode = "ol"
        elif stripped.startswith("#") or stripped == "---":
            flush()
            blocks.append(stripped)
            continue
        if mode and new_mode != mode:
            flush()
        mode = new_mode
        current.append(stripped)
    flush()
    return blocks


def render_daf_cards(meta: dict[str, str], glossary: dict[str, GlossaryEntry]) -> str:
    cards: list[str] = []

    for index in range(1, 5):
        external_url = meta.get(f"daf_external_url_{index}", "").strip()
        if not external_url:
            continue

        caption = meta.get(
            f"daf_caption_{index}",
            "הקטע שלמדנו נמצא בדף הגמרא. אפשר לפתוח את הדף המלא באתר פורטל הדף היומי.",
        ).strip()

        escaped_url = html.escape(external_url, quote=True)
        caption_html = inline_markdown(caption, glossary)

        cards.append(
            '<div class="daf-card daf-external-card">'
            "<figure>"
            f'<p class="daf-external-caption">{caption_html}</p>'
            f'<p><a class="button secondary" href="{escaped_url}" target="_blank" rel="noopener">'
            "פתחו את הדף באתר פורטל הדף היומי"
            "</a></p>"
            '<figcaption>הקישור נפתח באתר חיצוני. אין צורך להבין את כל הדף; המטרה היא לראות היכן נמצא הקטע שלמדנו.</figcaption>'
            "</figure>"
            "</div>"
        )

    return "\n".join(cards)


def render_markdown(
    body: str,
    meta: dict[str, str],
    glossary: dict[str, GlossaryEntry],
) -> tuple[str, list[tuple[str, str]]]:
    blocks = split_blocks(body)
    used_ids: set[str] = {"lesson-top"}
    toc: list[tuple[str, str]] = []
    out: list[str] = []
    open_section = False
    title_seen = False
    kicker_seen = False

    def close_section() -> None:
        nonlocal open_section
        if open_section:
            out.append("</section>")
            open_section = False

    for block in blocks:
        if block == "---":
            continue

        if block.startswith("# "):
            text = block[2:].strip()
            if re.fullmatch(r"שיעור\s+\d+", text):
                if not kicker_seen:
                    lesson_number = html.escape(meta.get("lesson_number", ""), quote=True)
                    out.append(
                        '<div class="lesson-kicker" '
                        'data-lesson-completion '
                        f'data-lesson-number="{lesson_number}" '
                        'aria-label="שמירת סימנייה לשיעור">'
                        f'<span>{inline_markdown(text, glossary)}</span>'
                        '<button class="lesson-bookmark-button" type="button" data-complete-lesson>'
                        '🔖 לשמור סימנייה'
                        '</button>'
                        '<span class="lesson-bookmark-status" data-completion-status aria-live="polite"></span>'
                        '</div>'
                    )
                    kicker_seen = True
                continue
            if not title_seen:
                out.append(f'<h1 id="lesson-top">{inline_markdown(text, glossary)}</h1>')
                toc.append(("lesson-top", text))
                title_seen = True
                continue
            block = "## " + text

        if block.startswith("## "):
            close_section()
            text = block[3:].strip()
            section_id = slugify_heading(text, used_ids)
            toc.append((section_id, text))
            out.append(f'<section class="lesson-section" id="{section_id}">')
            out.append(f"<h2>{inline_markdown(text, glossary)}</h2>")
            open_section = True

            if text == "פוגשים את הדף":
                daf_cards = render_daf_cards(meta, glossary)
                if daf_cards:
                    out.append(daf_cards)

            continue

        if block.startswith(">"):
            items = [line.lstrip(">").strip() for line in block.splitlines()]
            out.append('<blockquote class="source-quote">')
            for item in items:
                if item:
                    out.append(f"<p>{inline_markdown(item, glossary)}</p>")
            out.append("</blockquote>")
            continue

        if re.match(r"^[-*]\s+", block):
            out.append('<ul class="plain-list">')
            for line in block.splitlines():
                item = re.sub(r"^[-*]\s+", "", line).strip()
                out.append(f"<li>{inline_markdown(item, glossary)}</li>")
            out.append("</ul>")
            continue

        if re.match(r"^\d+\.\s+", block):
            out.append('<ol class="plain-list">')
            for line in block.splitlines():
                item = re.sub(r"^\d+\.\s+", "", line).strip()
                out.append(f"<li>{inline_markdown(item, glossary)}</li>")
            out.append("</ol>")
            continue

        image_match = re.fullmatch(
            r"!\[([^\]]*)\]\(([^)]+)\)",
            block.strip(),
        )

        if image_match:
            alt_text = image_match.group(1).strip()
            image_src = image_match.group(2).strip()

            if image_src.startswith("/"):
                image_src = f"{BASE_PATH}{image_src}"

            out.append(
                '<figure class="lesson-illustration">'
                f'<img src="{html.escape(image_src, quote=True)}" '
                f'alt="{html.escape(alt_text, quote=True)}" '
                'loading="lazy">'
                "</figure>"
            )
            continue

        paragraph = " ".join(block.splitlines())
        out.append(f"<p>{inline_markdown(paragraph, glossary)}</p>")

    close_section()
    return "\n".join(out), toc


def nav_html(active: str) -> str:
    links = []
    for label, href in NAV_ITEMS:
        cls = ' class="active"' if label == active else ""
        links.append(f'<a{cls} href="{href}">{label}</a>')
    return "\n".join(links)


def google_tag_html() -> str:
    return f'''  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id={GA_MEASUREMENT_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){{dataLayer.push(arguments);}}
    gtag('js', new Date());
    gtag('config', '{GA_MEASUREMENT_ID}');
  </script>'''


def default_og_image(meta: dict[str, str]) -> str:
    lesson_number = meta.get("lesson_number", "").strip()
    if lesson_number:
        return f"/assets/og/{lesson_number}.webp"
    return ""


def html_head(title: str, meta: dict[str, str] | None = None) -> str:
    meta = meta or {}
    page_title = meta.get("seo_title") or title
    desc = meta.get("seo_description") or meta.get("og_description") or SITE_SUBTITLE
    og_title = meta.get("og_title") or meta.get("title") or title
    og_desc = meta.get("og_description") or desc
    og_image = meta.get("og_image") or default_og_image(meta)
    og_image_tag = (
        f'<meta property="og:image" content="{html.escape(BASE_PATH + og_image if og_image.startswith("/") else og_image, quote=True)}">'
        if og_image
        else ""
    )
    return f'''<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
{google_tag_html()}
  <title>{html.escape(page_title)} | {SITE_NAME}</title>
  <meta name="description" content="{html.escape(desc, quote=True)}">
  <meta name="theme-color" content="#3F5F4A">
  <meta property="og:title" content="{html.escape(og_title, quote=True)}">
  <meta property="og:description" content="{html.escape(og_desc, quote=True)}">
  <meta property="og:type" content="article">
  {og_image_tag}
  <link rel="manifest" href="{BASE_PATH}/manifest.webmanifest">
  <link rel="icon" href="{BASE_PATH}/assets/icons/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="{BASE_PATH}/assets/icons/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700&family=Noto+Sans+Hebrew:wght@400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="{BASE_PATH}/assets/css/site.css">
</head>'''


def site_header(active: str) -> str:
    return f'''<header class="site-header">
  <a class="brand" href="{BASE_PATH}/he/">
    <span class="brand-title">{SITE_NAME}</span>
    <span class="brand-subtitle">{SITE_SUBTITLE}</span>
  </a>
  <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav">תפריט</button>
  <nav class="main-nav" id="main-nav" aria-label="ניווט ראשי">
    {nav_html(active)}
  </nav>
</header>'''


def site_footer() -> str:
    return f'''<footer class="site-footer">
  <p>© {SITE_NAME}</p>
</footer>
<script src="{BASE_PATH}/assets/js/site.js"></script>
<script src="{BASE_PATH}/assets/js/gemara-glossary-tooltips.js" defer></script>
<script src="{BASE_PATH}/assets/js/shabbat-lock.js"></script>
</body>
</html>'''


def whatsapp_signup_html() -> str:
    return f'''<section class="lesson-signup" aria-label="קבלת עדכונים">
  <strong>רוצים לקבל עדכון כשעולה שיעור חדש?</strong>
  <span>הצטרפו לערוץ הווטסאפ השקט של גמרא למתחילים בניחותא. נשלח שם רק עדכונים קצרים וקישור לשיעור באתר.</span>
  <a class="button secondary" href="{WHATSAPP_CHANNEL_URL}" target="_blank" rel="noopener">קבלו עדכון בווטסאפ</a>
</section>'''


def lesson_href(lesson: Lesson) -> str:
    lesson_number = html.escape(lesson.meta.get("lesson_number", ""), quote=True)
    return f"{BASE_PATH}/he/lessons/{lesson_number}.html"


def render_lesson_bottom_nav(next_lesson: Lesson | None) -> str:
    if next_lesson:
        next_number = html.escape(next_lesson.meta.get("lesson_number", ""))
        next_title = html.escape(next_lesson.meta.get("title", "השיעור הבא"))
        next_link = (
            f'<a href="{lesson_href(next_lesson)}">'
            f'לשיעור הבא: שיעור {next_number} — {next_title}'
            f"</a>"
        )
    else:
        next_link = "<span>השיעור הבא יתווסף בהמשך</span>"

    return f'''<nav class="lesson-bottom-nav" aria-label="ניווט בין שיעורים">
  <a href="{BASE_PATH}/he/lessons/">לכל שיעורי הסדרה</a>
  {next_link}
</nav>'''


def lesson_feedback_html(lesson: Lesson) -> str:
    lesson_number = html.escape(
        lesson.meta.get("lesson_number", ""),
        quote=True,
    )

    ratings = [
        "ברור מאוד",
        "די ברור",
        "ברור בחלקו",
        "היה לי קשה",
        "לא הצלחתי לעקוב",
    ]

    rating_inputs = "\n".join(
        f'''    <label class="lesson-feedback-option">
      <input type="radio" name="clarity_rating" value="{html.escape(rating, quote=True)}">
      <span>{html.escape(rating)}</span>
    </label>'''
        for rating in ratings
    )

    return f'''<section
  class="lesson-feedback"
  data-lesson-feedback
  data-lesson-number="{lesson_number}"
  aria-label="משוב על השיעור"
>
  <form data-feedback-form>
    <strong>עד כמה השיעור היה ברור?</strong>
    <p class="lesson-feedback-intro">אפשר לבחור דירוג, לכתוב הערה, או לשלוח את שניהם.</p>

    <div class="lesson-feedback-options" role="radiogroup" aria-label="עד כמה השיעור היה ברור?">
{rating_inputs}
    </div>

    <label class="lesson-feedback-comment">
      <span>יש משהו שתרצו לומר על השיעור?</span>
      <textarea
        name="comment"
        data-feedback-comment
        rows="3"
        maxlength="3000"
        placeholder="הערה, הצעה או מקום שכדאי להסביר אחרת"
      ></textarea>
    </label>

    <button class="button secondary lesson-feedback-submit" type="submit">
      שליחת משוב
    </button>

    <p class="lesson-feedback-status" data-feedback-status aria-live="polite"></p>
  </form>
</section>'''


def render_lesson_page(lesson: Lesson, next_lesson: Lesson | None = None) -> str:
    meta = lesson.meta
    title = meta.get("title", "שיעור")
    lesson_number = meta.get("lesson_number", "")
    toc_links = "\n".join(
        f'<a href="#{section_id}">{html.escape(label)}</a>'
        for section_id, label in lesson.toc
    )
    feedback = lesson_feedback_html(lesson)
    prev_next = render_lesson_bottom_nav(next_lesson)
    whatsapp_signup = whatsapp_signup_html()

    return f'''{html_head(f"שיעור {lesson_number} — {title}", meta)}
<body>
{site_header("שיעורים")}
<main class="lesson-layout">
  <aside class="lesson-toc" aria-label="ניווט בתוך השיעור">
    <details open>
      <summary>ניווט</summary>
      <nav>
        {toc_links}
      </nav>
    </details>
  </aside>
  <article class="lesson-article">
    {lesson.html_body}
    {feedback}
    {whatsapp_signup}
    {prev_next}
  </article>
</main>
{site_footer()}'''


def lesson_start_location(meta: dict[str, str]) -> tuple[str, str]:
    """Return the conventional daf/amud marker for the lesson's starting point.

    Examples:
    daf ב, amud א -> ב.
    daf ב, amud ב -> ב:
    daf ב, amud א-ב -> ב.  (the lesson starts on amud א)
    """
    daf = meta.get("daf", "").strip()
    amud = meta.get("amud", "").strip()

    if not daf or not amud:
        return "", ""

    start_amud = re.split(r"[-–—־]", amud, maxsplit=1)[0].strip()
    punctuation = "." if start_amud == "א" else ":" if start_amud == "ב" else ""

    if not punctuation:
        return "", ""

    marker = f"{daf}{punctuation}"
    accessible = f"דף {daf} עמוד {start_amud}"
    return marker, accessible


def render_lessons_index(lessons: list[Lesson]) -> str:
    sorted_lessons = sorted(
        lessons,
        key=lambda lesson: lesson.meta.get("lesson_number", ""),
    )

    rows = []
    lesson_numbers: list[str] = []

    for lesson in sorted_lessons:
        meta = lesson.meta
        raw_number = meta.get("lesson_number", "").strip()

        if not raw_number:
            continue

        lesson_numbers.append(raw_number)

        number = html.escape(raw_number)
        title = html.escape(meta.get("title", ""))
        slug = html.escape(raw_number, quote=True)
        desc = html.escape(meta.get("core_point") or meta.get("seo_description") or "")
        daf_marker, daf_accessible = lesson_start_location(meta)
        daf_html = ""

        if daf_marker:
            daf_html = (
                f'<span class="lesson-daf" title="{html.escape(daf_accessible, quote=True)}" '
                f'aria-label="{html.escape(daf_accessible, quote=True)}">'
                f'{html.escape(daf_marker)}'
                '</span>'
            )

        rows.append(
            f'''<a class="lesson-row" href="{BASE_PATH}/he/lessons/{slug}.html">
  <span class="lesson-number">
    <span class="lesson-number-value">{number}</span>
    {daf_html}
  </span>
  <span class="lesson-title">{title}</span>
  <span class="lesson-desc">{desc}</span>
</a>'''
        )

    rows_html = "\n".join(rows)

    numbers_attribute = html.escape(
        ",".join(lesson_numbers),
        quote=True,
    )

    if lesson_numbers:
        first_number = html.escape(lesson_numbers[0], quote=True)
        first_href = f"{BASE_PATH}/he/lessons/{first_number}.html"

        progress_html = f'''<div
  class="series-progress"
  data-series-progress
  data-lesson-numbers="{numbers_attribute}"
  hidden
>
  <a
    class="button primary series-progress-button"
    href="{first_href}"
    data-series-progress-link
  >
    התחילו מהשיעור הראשון
  </a>

  <p class="series-progress-note" data-series-progress-note>
    נקודת ההמשך נשמרת רק בדפדפן הזה.
  </p>
</div>'''
    else:
        progress_html = ""

    return f'''{html_head("כל שיעורי הסדרה")}
<body>
{site_header("שיעורים")}
<main class="page narrow-page">
  <h1>כל שיעורי הסדרה במסכת בבא קמא</h1>
  <p class="lead small">השיעורים מוצגים לפי סדר לימודי. מומלץ להתחיל מן השיעור הראשון.</p>
  {progress_html}
  <div class="lesson-list">
    {rows_html}
  </div>
</main>
{site_footer()}'''


def load_lessons(source_dir: Path, glossary: dict[str, GlossaryEntry]) -> list[Lesson]:
    lessons: list[Lesson] = []
    for path in sorted(source_dir.glob("*.md")):
        if path.name.upper() == "README.MD":
            continue
        text = path.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(text)
        html_body, toc = render_markdown(body, meta, glossary)
        lessons.append(Lesson(meta=meta, body=body, html_body=html_body, toc=toc))
    return lessons


def build_hebrew_lessons(glossary: dict[str, GlossaryEntry]) -> None:
    source_dir = ROOT / "content" / "lessons"
    if not source_dir.exists():
        return

    lessons = sorted(load_lessons(source_dir, glossary), key=lambda l: l.meta.get("lesson_number", ""))
    lessons_out = DIST / "he" / "lessons"
    lessons_out.mkdir(parents=True, exist_ok=True)

    for index, lesson in enumerate(lessons):
        lesson_number = lesson.meta.get("lesson_number")
        if not lesson_number:
            continue
        next_lesson = lessons[index + 1] if index + 1 < len(lessons) else None
        (lessons_out / f"{lesson_number}.html").write_text(
            render_lesson_page(lesson, next_lesson),
            encoding="utf-8",
        )

    (lessons_out / "index.html").write_text(render_lessons_index(lessons), encoding="utf-8")


def generate_og_images_if_available() -> None:
    try:
        scripts_dir = ROOT / "scripts"
        if str(scripts_dir) not in sys.path:
            sys.path.insert(0, str(scripts_dir))
        import generate_og  # type: ignore

        generate_og.generate_all()
    except Exception as exc:
        print(f"Warning: OG images were not generated: {exc}")


def main() -> None:
    os.chdir(ROOT)
    generate_og_images_if_available()
    clean_dist()
    copy_static_site()
    glossary = load_glossary()
    build_hebrew_lessons(glossary)
    rewrite_static_base_paths()
    print(f"Built site into {DIST} with BASE_PATH={BASE_PATH!r}")


if __name__ == "__main__":
    main()
