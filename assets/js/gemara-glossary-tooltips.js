(() => {
  "use strict";

  const BASE_PATH = "/gemara-benichuta";
  const GLOSSARY_URL = `${BASE_PATH}/he/מילון.md`;

  const CLASS_SOURCE_TERM = "glossary-term";
  const CLASS_TERM = "gb-glossary-term";
  const CLASS_WRAP = "gb-glossary-wrap";
  const CLASS_POPOVER = "gb-glossary-popover";
  const CLASS_CLOSE = "gb-glossary-close";

  document.addEventListener("DOMContentLoaded", async () => {
    injectStyles();

    const glossary = await loadGlossary();
    const glossaryById = new Map();

    glossary.forEach((entry) => {
      if (entry.id) {
        glossaryById.set(entry.id, entry);
      }
    });

    const markedTerms = Array.from(
      document.querySelectorAll(`.${CLASS_SOURCE_TERM}[data-glossary-id]`)
    );

    if (!markedTerms.length) return;

    markedTerms.forEach((termElement) => {
      replaceMarkedTermWithTooltip(termElement, glossaryById);
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

    const idIndex = header.findIndex((cell) => cell === "ID");
    const termIndex = header.findIndex((cell) => cell.includes("מילה"));
    const meaningIndex = header.findIndex((cell) => cell.includes("פירוש"));

    if (idIndex === -1 || termIndex === -1 || meaningIndex === -1) return [];

    return rows
      .map(splitRow)
      .map((cells) => ({
        id: cleanCell(cells[idIndex] || ""),
        term: cleanCell(cells[termIndex] || ""),
        meaning: cleanCell(cells[meaningIndex] || "")
      }))
      .filter((entry) => entry.id && entry.term && entry.meaning);
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

  function replaceMarkedTermWithTooltip(termElement, glossaryById) {
    const glossaryId = termElement.getAttribute("data-glossary-id") || "";
    const displayedTerm = termElement.textContent || "";

    const entryFromGlossary = glossaryById.get(glossaryId);

    const fallbackTerm =
      termElement.getAttribute("data-glossary-word") ||
      displayedTerm;

    const fallbackMeaning =
      termElement.getAttribute("data-tooltip") ||
      termElement.getAttribute("title") ||
      "";

    const entry = entryFromGlossary || {
      id: glossaryId,
      term: fallbackTerm,
      meaning: fallbackMeaning
    };

    if (!entry.id || !entry.term || !entry.meaning || !displayedTerm.trim()) {
      termElement.replaceWith(document.createTextNode(displayedTerm));
      return;
    }

    const tooltip = createTooltip(entry, displayedTerm);
    termElement.replaceWith(tooltip);
  }

  function createTooltip(entry, displayedTerm) {
    const wrap = document.createElement("span");
    wrap.className = CLASS_WRAP;

    const button = document.createElement("button");
    button.type = "button";
    button.className = CLASS_TERM;
    button.textContent = displayedTerm;
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("data-glossary-id", entry.id);

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
        positionPopoverNearButton(popover, button);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeAllTooltips();
      }
    });

    window.addEventListener("resize", closeAllTooltips);
    window.addEventListener("scroll", closeAllTooltips, { passive: true });
  }

  function positionPopoverNearButton(popover, button) {
    const margin = 12;
    const buttonRect = button.getBoundingClientRect();

    popover.style.position = "fixed";
    popover.style.width = "";
    popover.style.maxWidth = "";
    popover.style.left = "0px";
    popover.style.right = "auto";
    popover.style.top = "0px";
    popover.style.transform = "none";

    const maxWidth = Math.min(288, window.innerWidth - margin * 2);
    popover.style.width = `${maxWidth}px`;
    popover.style.maxWidth = `${maxWidth}px`;

    const popoverRect = popover.getBoundingClientRect();

    let left = buttonRect.left + buttonRect.width / 2 - popoverRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - popoverRect.width - margin));

    let top = buttonRect.bottom + 8;

    if (top + popoverRect.height > window.innerHeight - margin) {
      top = buttonRect.top - popoverRect.height - 8;
    }

    if (top < margin) {
      top = margin;
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function closeAllTooltips() {
    document.querySelectorAll(`.${CLASS_TERM}`).forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });

    document.querySelectorAll(`.${CLASS_POPOVER}`).forEach((popover) => {
      popover.hidden = true;
      popover.style.position = "";
      popover.style.width = "";
      popover.style.maxWidth = "";
      popover.style.left = "";
      popover.style.right = "";
      popover.style.top = "";
      popover.style.transform = "";
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
        position: fixed;
        z-index: 1000;
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
    `;

    document.head.appendChild(style);
  }
})();
