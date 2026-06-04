(() => {
  "use strict";

  const BASE_PATH = "/gemara-benichuta";
  const GLOSSARY_URL = `${BASE_PATH}/he/מילון_לשון_הגמרא.md`;

  const CLASS_TERM = "gb-glossary-term";
  const CLASS_WRAP = "gb-glossary-wrap";
  const CLASS_POPOVER = "gb-glossary-popover";

  document.addEventListener("DOMContentLoaded", async () => {
    injectStyles();

    const glossary = await loadGlossary();

    if (!glossary.length) {
      return;
    }

    const sourceQuotes = Array.from(document.querySelectorAll("blockquote.source-quote"));

    if (!sourceQuotes.length) {
      return;
    }

    const entries = glossary
      .map((entry) => ({
        ...entry,
        normalizedTerm: normalizeHebrew(entry.term)
      }))
      .filter((entry) => entry.normalizedTerm)
      .sort((a, b) => b.normalizedTerm.length - a.normalizedTerm.length);

    sourceQuotes.forEach((quote) => {
      applyGlossaryToElement(quote, entries);
    });

    setupTooltipClicks();
  });

  async function loadGlossary() {
    try {
      const response = await fetch(GLOSSARY_URL, { cache: "no-cache" });

      if (!response.ok) {
        return [];
      }

      const markdown = await response.text();
      return parseGlossary(markdown);
    } catch (error) {
      return [];
    }
  }

  function parseGlossary(markdown) {
    const lines = markdown
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("|") && line.endsWith("|"));

    if (lines.length < 3) {
      return [];
    }

    const header = splitRow(lines[0]);
    const rows = lines.slice(2);

    const termIndex = header.findIndex((cell) => cell.includes("מילה"));
    const meaningIndex = header.findIndex((cell) => cell.includes("משמעות"));
    const structureIndex = header.findIndex((cell) => cell.includes("מבנה"));

    if (termIndex === -1 || meaningIndex === -1) {
      return [];
    }

    return rows
      .map(splitRow)
      .map((cells) => ({
        term: cleanCell(cells[termIndex] || ""),
        meaning: cleanCell(cells[meaningIndex] || ""),
        structure: cleanCell(cells[structureIndex] || "")
      }))
      .filter((entry) => entry.term && entry.meaning);
  }

  function splitRow(line) {
    return line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  function cleanCell(value) {
    return value
      .replace(/\*\*/g, "")
      .replace(/<br\s*\/?>/gi, "; ")
      .replace(/&nbsp;/g, " ")
      .replace(/\u200e|\u200f|\u202a|\u202b|\u202c|\u202d|\u202e/g, "")
      .trim();
  }

  function normalizeHebrew(value) {
    return value
      .normalize("NFD")
      .replace(/[\u0591-\u05C7]/g, "")
      .replace(/\u200e|\u200f|\u202a|\u202b|\u202c|\u202d|\u202e/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeWithMap(value) {
    let normalized = "";
    const map = [];

    for (let i = 0; i < value.length; i += 1) {
      const char = value[i];
      const clean = normalizeHebrew(char);

      if (!clean) {
        continue;
      }

      normalized += clean;

      for (let j = 0; j < clean.length; j += 1) {
        map.push(i);
      }
    }

    return { normalized, map };
  }

  function applyGlossaryToElement(root, entries) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          if (node.parentElement && node.parentElement.closest(`.${CLASS_WRAP}`)) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    textNodes.forEach((node) => replaceInTextNode(node, entries));
  }

  function replaceInTextNode(textNode, entries) {
    const text = textNode.nodeValue;
    const matches = findMatches(text, entries);

    if (!matches.length) {
      return;
    }

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    matches.forEach((match) => {
      if (match.start > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.start)));
      }

      fragment.appendChild(createTooltip(match.entry, text.slice(match.start, match.end)));
      lastIndex = match.end;
    });

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  function findMatches(text, entries) {
    const { normalized, map } = normalizeWithMap(text);
    const matches = [];

    entries.forEach((entry) => {
      let fromIndex = 0;

      while (fromIndex < normalized.length) {
        const index = normalized.indexOf(entry.normalizedTerm, fromIndex);

        if (index === -1) {
          break;
        }

        const normalizedEnd = index + entry.normalizedTerm.length;
        const originalStart = map[index];
        const originalEnd = map[normalizedEnd - 1] + 1;

        const overlaps = matches.some((match) => {
          return originalStart < match.end && originalEnd > match.start;
        });

        if (!overlaps) {
          matches.push({
            start: originalStart,
            end: originalEnd,
            entry
          });
        }

        fromIndex = normalizedEnd;
      }
    });

    return matches.sort((a, b) => a.start - b.start);
  }

  function createTooltip(entry, displayedTerm) {
    const wrap = document.createElement("span");
    wrap.className = CLASS_WRAP;

    const button = document.createElement("button");
    button.type = "button";
    button.className = CLASS_TERM;
    button.textContent = displayedTerm;
    button.setAttribute("aria-expanded", "false");

    const popover = document.createElement("span");
    popover.className = CLASS_POPOVER;
    popover.hidden = true;

    const title = document.createElement("strong");
    title.textContent = entry.term;

    const meaning = document.createElement("span");
    meaning.className = "gb-glossary-meaning";
    meaning.textContent = entry.meaning;

    popover.appendChild(title);
    popover.appendChild(meaning);

    if (entry.structure && entry.structure !== "—") {
      const structure = document.createElement("span");
      structure.className = "gb-glossary-structure";

      const label = document.createElement("span");
      label.className = "gb-glossary-structure-label";
      label.textContent = "מבנה:";

      structure.appendChild(label);

      entry.structure
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => {
          const line = document.createElement("span");
          line.textContent = part;
          structure.appendChild(line);
        });

      popover.appendChild(structure);
    }

    wrap.appendChild(button);
    wrap.appendChild(popover);

    return wrap;
  }

  function setupTooltipClicks() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest(`.${CLASS_TERM}`);

      if (!button) {
        closeAllTooltips();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const wrap = button.closest(`.${CLASS_WRAP}`);
      const popover = wrap.querySelector(`.${CLASS_POPOVER}`);
      const isOpen = button.getAttribute("aria-expanded") === "true";

      closeAllTooltips();

      if (!isOpen) {
        button.setAttribute("aria-expanded", "true");
        popover.hidden = false;
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeAllTooltips();
      }
    });
  }

  function closeAllTooltips() {
    document.querySelectorAll(`.${CLASS_TERM}`).forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });

    document.querySelectorAll(`.${CLASS_POPOVER}`).forEach((popover) => {
      popover.hidden = true;
    });
  }

  function injectStyles() {
    const style = document.createElement("style");

    style.textContent = `
      .${CLASS_WRAP} {
        position: relative;
        display: inline-block;
      }

      .${CLASS_TERM} {
        appearance: none;
        border: 0;
        background: transparent;
        padding: 0 0.04em;
        margin: 0;
        font: inherit;
        color: inherit;
        cursor: pointer;
        border-bottom: 2px dotted #3F5F4A;
      }

      .${CLASS_TERM}:focus {
        outline: 2px solid #C9A86A;
        outline-offset: 3px;
        border-radius: 4px;
      }

      .${CLASS_POPOVER} {
        position: absolute;
        z-index: 50;
        right: 0;
        top: calc(100% + 0.45rem);
        min-width: 13rem;
        max-width: 18rem;
        padding: 0.85rem 1rem;
        border: 1px solid #C9A86A;
        border-radius: 12px;
        background: #FAF7F0;
        color: #1F2933;
        box-shadow: 0 8px 24px rgba(31, 41, 51, 0.18);
        font-size: 0.9em;
        line-height: 1.55;
        text-align: right;
        white-space: normal;
      }

      .${CLASS_POPOVER} strong,
      .${CLASS_POPOVER} span {
        display: block;
      }

      .gb-glossary-meaning {
        margin-top: 0.25rem;
        font-weight: 700;
      }

      .gb-glossary-structure {
        margin-top: 0.6rem;
        padding-top: 0.55rem;
        border-top: 1px solid rgba(201, 168, 106, 0.55);
        font-size: 0.92em;
      }

      .gb-glossary-structure-label {
        font-weight: 700;
        margin-bottom: 0.2rem;
      }

      @media (max-width: 640px) {
        .${CLASS_POPOVER} {
          position: fixed;
          right: 1rem;
          left: 1rem;
          top: auto;
          bottom: 1rem;
          max-width: none;
          width: auto;
        }
      }
    `;

    document.head.appendChild(style);
  }
})();
