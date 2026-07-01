(() => {
  'use strict';

  const BASE_PATH = '/gemara-benichuta';
  const HEBREW_MARKS = /[\u0591-\u05C7]/g;
  const MAX_SNIPPET_CHARS = 200;

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(HEBREW_MARKS, '')
      .replace(/[״“”„]/g, '"')
      .replace(/[׳‘’`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('he');
  }

  function normalizeWithMap(value) {
    const normalized = [];
    const map = [];
    Array.from(String(value || '')).forEach((character, originalIndex) => {
      const decomposed = character.normalize('NFKD').replace(HEBREW_MARKS, '');
      Array.from(decomposed).forEach((part) => {
        const replaced = part
          .replace(/[״“”„]/g, '"')
          .replace(/[׳‘’`]/g, "'")
          .toLocaleLowerCase('he');
        Array.from(replaced).forEach((output) => {
          normalized.push(output);
          map.push(originalIndex);
        });
      });
    });
    return { text: normalized.join(''), map };
  }

  function termPattern(term) {
    return Array.from(term)
      .map((character) => `${escapeRegExp(character)}[\u0591-\u05C7]*`)
      .join('');
  }

  function queryTerms(query) {
    return normalizeText(query).split(' ').filter(Boolean);
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function findAll(haystack, needle) {
    const positions = [];
    let from = 0;
    while (needle && from <= haystack.length) {
      const index = haystack.indexOf(needle, from);
      if (index === -1) break;
      positions.push(index);
      from = index + Math.max(needle.length, 1);
    }
    return positions;
  }

  function makeSnippet(text, terms) {
    const mapped = normalizeWithMap(text);
    const normalized = mapped.text;
    const matches = terms.map((term) => ({ term, positions: findAll(normalized, term) }));
    if (matches.some((match) => match.positions.length === 0)) return null;

    let selected = matches[0].positions[0];
    let selectedTerm = matches[0].term;

    if (matches.length > 1) {
      let best = null;
      matches.forEach((candidate) => {
        candidate.positions.forEach((position) => {
          const distances = matches.map((other) => Math.min(...other.positions.map((p) => Math.abs(p - position))));
          const score = Math.max(...distances);
          if (!best || score < best.score || (score === best.score && position < best.position)) {
            best = { score, position, term: candidate.term };
          }
        });
      });
      selected = best.position;
      selectedTerm = best.term;
    }

    const originalSelected = mapped.map[selected] ?? 0;
    const half = Math.floor(MAX_SNIPPET_CHARS / 2);
    let start = Math.max(0, originalSelected - half);
    let end = Math.min(text.length, start + MAX_SNIPPET_CHARS);
    start = Math.max(0, end - MAX_SNIPPET_CHARS);

    if (start > 0) {
      const nextSpace = text.indexOf(' ', start);
      if (nextSpace !== -1 && nextSpace < originalSelected) start = nextSpace + 1;
    }
    if (end < text.length) {
      const previousSpace = text.lastIndexOf(' ', end);
      if (previousSpace > originalSelected) end = previousSpace;
    }

    const snippet = `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
    const occurrence = findAll(normalized.slice(0, selected + selectedTerm.length), selectedTerm).length - 1;
    return { snippet, anchor: selectedTerm, occurrence: Math.max(0, occurrence) };
  }

  function highlightedFragment(text, terms) {
    const fragment = document.createDocumentFragment();
    if (!terms.length) {
      fragment.append(document.createTextNode(text));
      return fragment;
    }

    const pattern = new RegExp(`(${terms.map(termPattern).sort((a, b) => b.length - a.length).join('|')})`, 'giu');
    let last = 0;
    for (const match of text.matchAll(pattern)) {
      fragment.append(document.createTextNode(text.slice(last, match.index)));
      const mark = document.createElement('mark');
      mark.textContent = match[0];
      fragment.append(mark);
      last = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(last)));
    return fragment;
  }

  async function initSearchPage() {
    const container = document.querySelector('[data-lesson-search]');
    const input = document.querySelector('[data-lesson-search-input]');
    const status = document.querySelector('[data-lesson-search-status]');
    const list = document.querySelector('[data-lesson-list]');
    if (!container || !input || !status || !list) return;

    const rows = new Map(
      Array.from(list.querySelectorAll('.lesson-row[data-lesson-number]'))
        .map((row) => [row.dataset.lessonNumber, row])
    );
    let index = null;

    async function loadIndex() {
      if (index) return index;
      const response = await fetch(`${BASE_PATH}/assets/data/search-index-he.json`, { cache: 'no-cache' });
      if (!response.ok) throw new Error('Search index unavailable');
      index = await response.json();
      return index;
    }

    function clearResultState() {
      rows.forEach((row) => {
        row.hidden = false;
        row.classList.remove('is-search-result');
        row.querySelector('.lesson-search-snippet')?.remove();
        row.removeAttribute('href');
        const originalHref = row.dataset.originalHref;
        if (originalHref) row.setAttribute('href', originalHref);
      });
      status.textContent = '';
      container.classList.remove('is-active');
    }

    rows.forEach((row) => { row.dataset.originalHref = row.getAttribute('href') || ''; });

    async function runSearch() {
      const rawQuery = input.value.trim();
      const terms = queryTerms(rawQuery);
      if (!terms.length) {
        clearResultState();
        return;
      }

      container.classList.add('is-active');
      status.textContent = 'מחפש…';

      try {
        const items = await loadIndex();
        let count = 0;

        items.forEach((item) => {
          const row = rows.get(item.lesson_number);
          if (!row) return;
          const snippetData = makeSnippet(item.text, terms);
          row.querySelector('.lesson-search-snippet')?.remove();

          if (!snippetData) {
            row.hidden = true;
            row.classList.remove('is-search-result');
            return;
          }

          count += 1;
          row.hidden = false;
          row.classList.add('is-search-result');

          const snippet = document.createElement('span');
          snippet.className = 'lesson-search-snippet';
          snippet.append(highlightedFragment(snippetData.snippet, terms));
          row.append(snippet);

          const url = new URL(item.url, window.location.origin);
          url.searchParams.set('q', rawQuery);
          url.searchParams.set('anchor', snippetData.anchor);
          url.searchParams.set('occ', String(snippetData.occurrence));
          row.href = url.toString();
        });

        status.textContent = count
          ? `נמצאו ${count} ${count === 1 ? 'שיעור' : 'שיעורים'}.`
          : `לא נמצאו שיעורים הכוללים את הביטוי „${rawQuery}”.`;
      } catch (error) {
        status.textContent = 'לא היה אפשר לטעון את החיפוש כרגע. נסו לרענן את הדף.';
      }
    }

    let timer = null;
    input.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(runSearch, 120);
    });

    if (window.location.hash === '#lesson-search') {
      window.setTimeout(() => input.focus({ preventScroll: false }), 0);
    }
  }

  function textNodesWithin(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest('script, style, button, input, textarea, select, mark.search-hit')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function initLessonHighlight() {
    const article = document.querySelector('.lesson-article');
    if (!article) return;

    const params = new URLSearchParams(window.location.search);
    const query = params.get('q') || '';
    const anchor = normalizeText(params.get('anchor') || '');
    const targetOccurrence = Number.parseInt(params.get('occ') || '0', 10) || 0;
    const terms = queryTerms(query);
    if (!terms.length) return;

    const nodes = textNodesWithin(article);
    let anchorSeen = 0;
    let targetMark = null;

    nodes.forEach((node) => {
      const text = node.nodeValue;
      const normalized = normalizeText(text);
      if (!terms.some((term) => normalized.includes(term))) return;

      const pattern = new RegExp(`(${terms.map(termPattern).sort((a, b) => b.length - a.length).join('|')})`, 'giu');
      const fragment = document.createDocumentFragment();
      let last = 0;

      for (const match of text.matchAll(pattern)) {
        fragment.append(document.createTextNode(text.slice(last, match.index)));
        const mark = document.createElement('mark');
        mark.className = 'search-hit';
        mark.textContent = match[0];
        const normalizedMatch = normalizeText(match[0]);
        if (normalizedMatch === anchor) {
          if (anchorSeen === targetOccurrence && !targetMark) {
            targetMark = mark;
            mark.classList.add('search-hit-target');
          }
          anchorSeen += 1;
        }
        fragment.append(mark);
        last = match.index + match[0].length;
      }
      fragment.append(document.createTextNode(text.slice(last)));
      node.replaceWith(fragment);
    });

    const destination = targetMark || article.querySelector('.search-hit');
    if (destination) {
      window.setTimeout(() => {
        destination.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initSearchPage();
    initLessonHighlight();
  });
})();
