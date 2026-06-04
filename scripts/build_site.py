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
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
BASE_PATH = "/gemara-benichuta"
SITE_NAME = "גמרא למתחילים בניחותא"
SITE_SUBTITLE = "לימוד תלמוד וגמרא מן המקור — צעד אחר צעד"
WHATSAPP_CHANNEL_URL = "https://whatsapp.com/channel/0029VbCtpPOB4hdMMUaLUb0h"
GA_MEASUREMENT_ID = "G-BBYFSSTE1Z"

NAV_ITEMS = [
    ("בית", f"{BASE_PATH}/he/"),
    ("שיעורים", f"{BASE_PATH}/he/lessons/"),
    ("איך לומדים כאן?", f"{BASE_PATH}/he/how.html"),
    ("אודות", f"{BASE_PATH}/he/about.html"),
]

HEADING_IDS = {
    "מה צריך לדעת לפני שנכנסים?": "before",
    "לשון המקור": "source",
    "במילים פשוטות": "simple",
    "מה עומד מאחורי שאלת הפתיחה?": "question-behind",
    "איך הסוגיה חושבת?": "thinking",
    "פוגשים את הדף": "daf",
    "מושגים חדשים": "concepts",
    "מילון ארמית קצר": "aramaic",
    "בודקים שהבנו": "check",
    "מה נשאר ביד": "takeaway",
}


@dataclass
class Lesson:
    meta: dict[str, str]
    body: str
    html_body: str
    toc: list[tuple[str, str]]


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
    for name in ["assets", "he", "en", "manifest.webmanifest"]:
        copy_if_exists(ROOT / name, DIST / name)


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
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
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


def inline_markdown(text: str) -> str:
    placeholders: list[str] = []

    def stash(value: str) -> str:
        placeholders.append(value)
        return f"\u0000{len(placeholders)-1}\u0000"

    text = html.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", lambda m: stash(f"<code>{m.group(1)}</code>"), text)
    text = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda m: stash(f'<a href="{html.escape(m.group(2), quote=True)}">{m.group(1)}</a>'),
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


def render_markdown(body: str, meta: dict[str, str]) -> tuple[str, list[tuple[str, str]]]:
    blocks = split_blocks(body)
    used_ids: set[str] = {"lesson-top"}
    toc: list[tuple[str, str]] = []
    out: list[str] = []
    open_section = False
    title_seen = False
    kicker_seen = False
    daf_inserted = False

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
                    out.append(f'<p class="lesson-kicker">{inline_markdown(text)}</p>')
                    kicker_seen = True
                continue
            if not title_seen:
                out.append(f'<h1 id="lesson-top">{inline_markdown(text)}</h1>')
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
            out.append(f"<h2>{inline_markdown(text)}</h2>")
            open_section = True
            if text == "פוגשים את הדף" and meta.get("daf_image"):
                daf_inserted = True
                daf_name = html.escape(meta.get("daf_image", ""), quote=True)
                source_ref = meta.get("source_ref", "דף הגמרא")
                daf_alt = html.escape(f"{source_ref}, עם סימון הקטע הנלמד", quote=True)
                out.append(
                    f'<div class="daf-card" data-daf-image="{daf_name}" data-daf-alt="{daf_alt}">'
                    '<figure><picture></picture><figcaption></figcaption>'
                    f'<p class="missing-note">עדיין לא נמצאה תמונת דף בשם <code>{daf_name}.webp</code> או <code>{daf_name}.png</code>. לאחר שתונח בתיקייה, היא תופיע כאן אוטומטית.</p>'
                    '</figure></div>'
                )
            continue

        if block.startswith(">"):
            items = [line.lstrip(">").strip() for line in block.splitlines()]
            out.append('<blockquote class="source-quote">')
            for item in items:
                if item:
                    out.append(f"<p>{inline_markdown(item)}</p>")
            out.append("</blockquote>")
            continue

        if re.match(r"^[-*]\s+", block):
            out.append('<ul class="plain-list">')
            for line in block.splitlines():
                item = re.sub(r"^[-*]\s+", "", line).strip()
                out.append(f"<li>{inline_markdown(item)}</li>")
            out.append("</ul>")
            continue

        if re.match(r"^\d+\.\s+", block):
            out.append('<ol class="plain-list">')
            for line in block.splitlines():
                item = re.sub(r"^\d+\.\s+", "", line).strip()
                out.append(f"<li>{inline_markdown(item)}</li>")
            out.append("</ol>")
            continue

        paragraph = " ".join(block.splitlines())
        out.append(f"<p>{inline_markdown(paragraph)}</p>")

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
    og_image_tag = f'<meta property="og:image" content="{html.escape(BASE_PATH + og_image if og_image.startswith("/") else og_image, quote=True)}">' if og_image else ""
    return f'''<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
{google_tag_html()}
  <title>{html.escape(page_title)} | {SITE_NAME}</title>
  <meta name="description" content="{html.escape(desc, quote=True)}">
  <meta property="og:title" content="{html.escape(og_title, quote=True)}">
  <meta property="og:description" content="{html.escape(og_desc, quote=True)}">
  <meta property="og:type" content="article">
  {og_image_tag}
  <link rel="manifest" href="{BASE_PATH}/manifest.webmanifest">
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
            f'</a>'
        )
    else:
        next_link = "<span>השיעור הבא יתווסף בהמשך</span>"

    return f'''<nav class="lesson-bottom-nav" aria-label="ניווט בין שיעורים">
  <a href="{BASE_PATH}/he/lessons/">לכל שיעורי הסדרה</a>
  {next_link}
</nav>'''


def render_lesson_page(lesson: Lesson, next_lesson: Lesson | None = None) -> str:
    meta = lesson.meta
    title = meta.get("title", "שיעור")
    lesson_number = meta.get("lesson_number", "")
    toc_links = "\n".join(f'<a href="#{section_id}">{html.escape(label)}</a>' for section_id, label in lesson.toc)
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
    {whatsapp_signup}
    {prev_next}
  </article>
</main>
{site_footer()}'''


def render_lessons_index(lessons: list[Lesson]) -> str:
    rows = []
    for lesson in sorted(lessons, key=lambda l: l.meta.get("lesson_number", "")):
        meta = lesson.meta
        number = html.escape(meta.get("lesson_number", ""))
        title = html.escape(meta.get("title", ""))
        slug = html.escape(meta.get("lesson_number", ""), quote=True)
        desc = html.escape(meta.get("core_point") or meta.get("seo_description") or "")
        rows.append(
            f'''<a class="lesson-row" href="{BASE_PATH}/he/lessons/{slug}.html">
  <span class="lesson-number">{number}</span>
  <span class="lesson-title">{title}</span>
  <span class="lesson-desc">{desc}</span>
</a>'''
        )
    rows_html = "\n".join(rows)
    return f'''{html_head("כל שיעורי הסדרה")}
<body>
{site_header("שיעורים")}
<main class="page narrow-page">
  <h1>כל שיעורי הסדרה</h1>
  <p class="lead small">השיעורים מוצגים לפי סדר לימודי. מומלץ להתחיל מן השיעור הראשון.</p>
  <div class="lesson-list">
    {rows_html}
  </div>
</main>
{site_footer()}'''


def load_lessons(source_dir: Path) -> list[Lesson]:
    lessons: list[Lesson] = []
    for path in sorted(source_dir.glob("*.md")):
        if path.name.upper() == "README.MD":
            continue
        text = path.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(text)
        html_body, toc = render_markdown(body, meta)
        lessons.append(Lesson(meta=meta, body=body, html_body=html_body, toc=toc))
    return lessons


def build_hebrew_lessons() -> None:
    source_dir = ROOT / "content" / "lessons"
    if not source_dir.exists():
        return

    lessons = sorted(load_lessons(source_dir), key=lambda l: l.meta.get("lesson_number", ""))
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
    build_hebrew_lessons()
    print(f"Built site into {DIST}")


if __name__ == "__main__":
    main()
