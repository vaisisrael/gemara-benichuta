(() => {
  "use strict";

  const BASE_PATH = "/gemara-benichuta";
  const GLOSSARY_URL = `${BASE_PATH}/he/מילון_לשון_הגמרא.md`;

  const CLASS_TERM = "gb-glossary-term";
  const CLASS_WRAP = "gb-glossary-wrap";
  const CLASS_POPOVER = "gb-glossary-popover";
  const CLASS_CLOSE = "gb-glossary-close";

  document.addEventListener("DOMContentLoaded", async () => {
    injectStyles();

    const glossary = await loadGlossary();
    if (!glossary.length) return;

    const glossaryMap = new Map();

    glossary.forEach((entry) => {
      const normalizedTerm = normalizeHebrew(entry.term);

      // עובדים רק עם מילים בודדות, לא עם ביטויים בני כמה מילים.
      if (!normalizedTerm || /\s/.test(normalizedTerm)) return;

      glossaryMap.set(normalizedTerm, entry);
    });

    if (!glossaryMap.size) return;

    const sourceQuotes = Array.from(document.querySelectorAll("blockquote.source-quote"));
    if (!sourceQuotes.length) return;

    sourceQuotes.forEach((quote) => {
      const usedTermsInThisQuote = new Set();
      applyGlossaryToElement(quote, glossaryMap, usedTermsInThisQuote);
    });

    setupTooltipClicks();
  });

  async function loadGlossary() {
    try {
      const response = await fetch(GLOSSARY_URL, { cache: "no-cache" });
      if (!response.ok) return [];

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

    if (lines.length < 3) return [];

    const header = splitRow(lines[0]);
    const rows = lines.slice(2);

    const termIndex = header.findIndex((cell) => cell.includes("מילה"));
    const meaningIndex = header.findIndex((cell) => cell.includes("משמעות"));
    const structureIndex = header.findIndex((cell) => cell.includes("מבנה"));

    if (termIndex === -1 || meaningIndex === -1) return [];

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

  function applyGlossaryToElement(root, glossaryMap, usedTermsInThisQuote) {
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

    textNodes.forEach((textNode) => {
      replaceWordsInTextNode(textNode, glossaryMap, usedTermsInThisQuote);
    });
  }

  function replaceWordsInTextNode(textNode, glossaryMap, usedTermsInThisQuote) {
    const text = textNode.nodeValue;
    const wordRegex = /[א-ת\u0591-\u05C7]+/g;

    let match;
    let lastIndex = 0;
    let changed = false;

    const fragment = document.createDocumentFragment();

    while ((match = wordRegex.exec(text)) !== null) {
      const word = match[0];
      const start = match.index;
      const end = start + word.length;

      if (start > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
      }

      const normalizedWord = normalizeHebrew(word);
      const entry = glossaryMap.get(normalizedWord);

      if (entry && !usedTermsInThisQuote.has(normalizedWord)) {
        fragment.appendChild(createTooltip(entry, word));
        usedTermsInThisQuote.add(normalizedWord);
        changed = true;
      } else {
        fragment.appendChild(document.createTextNode(word));
      }

      lastIndex = end;
    }

    if (!changed) return;

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
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

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = CLASS_CLOSE;
    closeButton.setAttribute("aria-label", "סגירת בועית");
    closeButton.textContent = "×";

    const title = document.createElement("strong");
    title.textContent = entry.term;

    const meaning = document.createElement("span");
    meaning.className = "gb-glossary-meaning";
    meaning.textContent = entry.meaning;

    popover.appendChild(closeButton);
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
      const closeButton = event.target.closest(`.${CLASS_CLOSE}`);

      if (closeButton) {
        event.preventDefault();
        event.stopPropagation();
        closeAllTooltips();
        return;
      }

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
        keepPopoverInsideViewport(popover);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeAllTooltips();
      }
    });

    window.addEventListener("resize", () => {
      document.querySelectorAll(`.${CLASS_POPOVER}:not([hidden])`).forEach((popover) => {
        keepPopoverInsideViewport(popover);
      });
    });
  }

  function keepPopoverInsideViewport(popover) {
    popover.style.left = "";
    popover.style.right = "";
    popover.style.transform = "";

    const margin = 12;
    const rect = popover.getBoundingClientRect();

    if (rect.left < margin) {
      popover.style.left = `${margin}px`;
      popover.style.right = "auto";
      popover.style.transform = "none";
      popover.style.position = "fixed";
      return;
    }

    if (rect.right > window.innerWidth - margin) {
      popover.style.left = "auto";
      popover.style.right = `${margin}px`;
      popover.style.transform = "none";
      popover.style.position = "fixed";
      return;
    }

    popover.style.position = "absolute";
  }

  function closeAllTooltips() {
    document.querySelectorAll(`.${CLASS_TERM}`).forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });

    document.querySelectorAll(`.${CLASS_POPOVER}`).forEach((popover) => {
      popover.hidden = true;
      popover.style.left = "";
      popover.style.right = "";
      popover.style.transform = "";
      popover.style.position = "";
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
        padding: 0 0.03em;
        margin: 0 0.04em;
        font: inherit;
        color: inherit;
        cursor: pointer;
        text-decoration-line: underline;
        text-decoration-style: solid;
        text-decoration-thickness: 1px;
        text-underline-offset: 0.24em;
        text-decoration-color: rgba(63, 95, 74, 0.72);
      }

      .${CLASS_TERM}:focus {
        outline: 2px solid #C9A86A;
        outline-offset: 3px;
        border-radius: 4px;
      }

      .${CLASS_POPOVER} {
        position: absolute;
        z-index: 100;
        right: 0;
        top: calc(100% + 0.35rem);
        min-width: 13rem;
        max-width: min(18rem, calc(100vw - 24px));
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

      .${CLASS_CLOSE} {
        position: absolute;
        top: 0.35rem;
        left: 0.45rem;
        width: 1.7rem;
        height: 1.7rem;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: #1F2933;
        font-size: 1.25rem;
        line-height: 1;
        cursor: pointer;
      }

      .${CLASS_CLOSE}:focus,
      .${CLASS_CLOSE}:hover {
        background: rgba(201, 168, 106, 0.22);
        outline: none;
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
    `;

    document.head.appendChild(style);
  }
})();
