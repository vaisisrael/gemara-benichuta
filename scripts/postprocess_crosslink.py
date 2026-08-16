from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
LINK_HTML = ' · <a href="https://www.parasha-week.co.il/">עוד בניחותא: פרשת השבוע בניחותא</a>'
MARKER = 'עוד בניחותא: פרשת השבוע בניחותא'


def main() -> None:
    changed = 0

    for path in DIST.rglob("*.html"):
        text = path.read_text(encoding="utf-8")

        if MARKER in text:
            continue

        match = re.search(
            r'(<footer\s+class="site-footer"[^>]*>.*?<p>)(.*?)(</p>)',
            text,
            flags=re.S,
        )

        if not match:
            continue

        replacement = match.group(1) + match.group(2) + LINK_HTML + match.group(3)
        updated = text[:match.start()] + replacement + text[match.end():]
        path.write_text(updated, encoding="utf-8")
        changed += 1

    print(f"Cross-link added to {changed} Gemara HTML pages")


if __name__ == "__main__":
    main()
