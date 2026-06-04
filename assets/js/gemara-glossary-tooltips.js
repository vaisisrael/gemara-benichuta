(() => {
  "use strict";

  const CONFIG = {
    glossaryFileName: "מילון_לשון_הגמרא.md",
    sourceHeadingText: "לשון המקור",
    tooltipClass: "gb-glossary-tooltip",
    termClass: "gb-glossary-term",
    wrapClass: "gb-glossary-wrap",
    popoverClass: "gb-glossary-popover"
  };

  document.addEventListener("DOMContentLoaded", async () => {
    injectTooltipStyles();

    const glossaryUrl = buildGlossaryUrl();
    const glossary = await loadGlossary(glossaryUrl);

    if (!glossary.length) return;

    const sourceBlocks = findSourceBlockquotes();
    if (!sourceBlocks.length) return;

    const sortedEntries = [...glossary].sort((a, b) => b.term.length - a.term.length);

    sourceBlocks.forEach((block) => {
      applyGlossaryToElement(block, sortedEntries);
    });

    setupTooltipBehavior();
  });

  function buildGlossaryUrl() {
    const script = document.currentScript;
    const customUrl = script?.dataset?.glossaryUrl;

    if (customUrl) return customUrl;

    const path = window.location.pathname;
    const heIndex = path.indexOf("/he/");

    if (heIndex !== -1) {
      const base = path.slice(0, heIndex + 4); // כולל /he/
      return `${base}${CONFIG.glossaryFileName}`;
    }

    return `/he/${CONFIG.glossaryFileName}`;
  }

  async function loadGlossary(url) {
    try {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) {
        console.warn("לא הצלחתי לטעון את מילון לשון הגמרא:", url);
        return [];
      }

      const markdown = await response.text();
      return parseGlossaryMarkdownTable(markdown);
    } catch (error) {
      console.warn("שגיאה בטעינת מילון לשון הגמרא:", error);
      return [];
    }
  }

  function parseGlossaryMarkdownTable(markdown) {
    const lines = markdown
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const tableLines = lines.filter((line) => line.startsWith("|") && line.endsWith("|"));

    if (tableLines.length < 3) return [];

    const header = splitMarkdownTableRow(tableLines[0]);
    const dataLines = tableLines.slice(2);

    const termIndex = header.findIndex((h) => h.includes("מילה"));
    const meaningIndex = header.findIndex((h) => h.includes("משמעות"));
    const structureIndex = header.findIndex((h) => h.includes("מבנה"));

    if (termIndex === -1 || meaningIndex === -1) return [];

    return dataLines
      .map((line) => splitMarkdownTableRow(line))
      .map((cells) => {
        const term = cleanMarkdownCell(cells[termIndex] || "");
        const meaning = cleanMarkdownCell(cells[meaningIndex] || "");
        const structure = cleanMarkdownCell(cells[structureIndex] || "");

        return { term, meaning, structure };
      })
      .filter((entry) => entry.term && entry.meaning);
  }

  function splitMarkdownTableRow(line) {
    return line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  function cleanMarkdownCell(value) {
    return value
      .replace(/\*\*/g, "")
      .replace(/<br\s*\/?>/gi, "; ")
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  function findSourceBlockquotes() {
    const headings = Array.from(document.querySelectorAll("h2, h3"));
    const sourceHeading = headings.find((heading) =>
      normalizeText(heading.textContent).includes(CONFIG.sourceHeadingText)
    );

    if (!sourceHeading) return [];

    const blocks = [];
    let node = sourceHeading.nextElementSibling;

    while (node) {
      if (node.matches("h2")) break;

      if (node.matches("blockquote")) {
        blocks.push(node);
      }

      blocks.push(...Array.from(node.querySelectorAll?.("blockquote") || []));

      node = node.nextElementSibling;
    }

    return blocks;
  }

  function applyGlossaryToElement(root, entries) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          if (node.parentElement?.closest(`.${CONFIG.wrapClass}`)) {
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
      replaceTermsInTextNode(textNode, entries);
    });
  }

  function replaceTermsInTextNode(textNode, entries) {
    const text = textNode.nodeValue;
    const matches = findNonOverlappingMatches(text, entries);

    if (!matches.length) return;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    matches.forEach((match) => {
      if (match.start > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.start)));
      }

      fragment.appendChild(createGlossaryElement(match.entry));
      lastIndex = match.end;
    });

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  function findNonOverlappingMatches(text, entries) {
    const matches = [];

    entries.forEach((entry) => {
      let start = 0;

      while (true) {
        const index = text.indexOf(entry.term, start);
        if (index === -1) break;

        const end = index + entry.term.length;

        const overlaps = matches.some((m) =>
          (index >= m.start && index < m.end) || (end > m.start && end <= m.end)
        );

        if (!overlaps) {
          matches.push({ start: index, end, entry });
        }

        start = end;
      }
    });

    return matches.sort((a, b) => a.start - b.start);
  }

  function createGlossaryElement(entry) {
    const wrap = document.createElement("span");
    wrap.className = CONFIG.wrapClass;

    const button = document.createElement("button");
    button.type = "button";
    button.className = CONFIG.termClass;
    button.textContent = entry.term;
    button.setAttribute("aria-expanded", "false");

    const popover = document.createElement("span");
    popover.className = CONFIG.popoverClass;
    popover.setAttribute("role", "tooltip");
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

  function setupTooltipBehavior() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest(`.${CONFIG.termClass}`);

      if (!button) {
        closeAllTooltips();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const wrap = button.closest(`.${CONFIG.wrapClass}`);
      const popover = wrap.querySelector(`.${CONFIG.popoverClass}`);
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
    document.querySelectorAll(`.${CONFIG.termClass}[aria-expanded="true"]`).forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });

    document.querySelectorAll(`.${CONFIG.popoverClass}`).forEach((popover) => {
      popover.hidden = true;
    });
  }

  function injectTooltipStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .${CONFIG.wrapClass} {
        position: relative;
        display: inline-block;
      }

      .${CONFIG.termClass} {
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

      .${CONFIG.termClass}:focus {
        outline: 2px solid #C9A86A;
        outline-offset: 3px;
        border-radius: 4px;
      }

      .${CONFIG.popoverClass} {
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

      .${CONFIG.popoverClass} strong,
      .${CONFIG.popoverClass} span {
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
        .${CONFIG.popoverClass} {
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

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }
})();
