document.addEventListener('DOMContentLoaded', () => {
  const BASE_PATH = '/gemara-benichuta';

  const btn = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#main-nav');

  if (btn && nav) {
    btn.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(isOpen));
    });
  }

  // Public footer should not display internal planning notes such as future /en/ support.
  document.querySelectorAll('.site-footer p').forEach((p, index) => {
    if (index > 0 || p.textContent.includes('/en/') || p.textContent.includes('אנגלית')) {
      p.remove();
    }
  });

  const lessonToc = document.querySelector('.lesson-toc');
  const lessonTocDetails = document.querySelector('.lesson-toc details');
  const lessonTocNav = document.querySelector('.lesson-toc nav');
  const lessonTitle = document.querySelector('.lesson-article h1');

  const isMobile = () => window.matchMedia('(max-width: 850px)').matches;

  if (lessonTocNav && lessonTitle) {
    lessonTitle.id = lessonTitle.id || 'lesson-top';
    const hasTopLink = lessonTocNav.querySelector('a[href="#lesson-top"]');

    if (!hasTopLink) {
      const topLink = document.createElement('a');
      topLink.href = '#lesson-top';
      topLink.textContent = lessonTitle.textContent.trim();
      topLink.dataset.tocAuto = 'lesson-title';
      lessonTocNav.prepend(topLink);
    }
  }

  const syncTocOpenState = () => {
    if (!lessonToc || !lessonTocDetails) return;
    lessonToc.classList.toggle('is-open', lessonTocDetails.open && isMobile());
  };

  // On mobile, the in-lesson navigation should open only by explicit user request.
  if (lessonTocDetails && isMobile()) {
    lessonTocDetails.removeAttribute('open');
  }

  if (lessonTocDetails && lessonToc) {
    syncTocOpenState();

    lessonTocDetails.addEventListener('toggle', () => {
      syncTocOpenState();
      updateActiveTocLink();
      keepActiveLinkVisible();
    });
  }

  const getStickyOffset = () => {
    const header = document.querySelector('.site-header');
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    return headerHeight + 14;
  };

  const getTocLinks = () => Array.from(document.querySelectorAll('.lesson-toc nav a[href^="#"]'));

  function getTargetForLink(link) {
    const href = link.getAttribute('href');
    if (!href || href === '#') return null;

    try {
      return document.querySelector(decodeURIComponent(href));
    } catch (error) {
      return document.querySelector(href);
    }
  }

  function updateActiveTocLink() {
    const tocLinks = getTocLinks();
    if (!tocLinks.length) return;

    const offset = getStickyOffset() + Math.min(140, window.innerHeight * 0.22);
    let activeLink = tocLinks[0];

    tocLinks.forEach((link) => {
      const target = getTargetForLink(link);
      if (!target) return;

      if (target.getBoundingClientRect().top <= offset) {
        activeLink = link;
      }
    });

    tocLinks.forEach((link) => link.classList.toggle('is-active', link === activeLink));
  }

  function keepActiveLinkVisible() {
    if (!lessonTocDetails || !lessonTocNav || !lessonTocDetails.open) return;

    const activeLink = lessonTocNav.querySelector('a.is-active');
    if (!activeLink) return;

    const navRect = lessonTocNav.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();

    if (linkRect.top < navRect.top || linkRect.bottom > navRect.bottom) {
      activeLink.scrollIntoView({ block: 'nearest' });
    }
  }

  function closeMobileToc() {
    if (!lessonTocDetails || !lessonToc || !isMobile()) return;

    lessonTocDetails.removeAttribute('open');
    lessonToc.classList.remove('is-open');
  }

  if (lessonToc) {
    lessonToc.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;

      const target = getTargetForLink(link);
      if (!target) return;

      event.preventDefault();

      const scrollToTarget = () => {
        const targetY = target.getBoundingClientRect().top + window.scrollY - getStickyOffset();
        window.scrollTo({ top: Math.max(targetY, 0), behavior: 'smooth' });
        history.replaceState(null, '', link.getAttribute('href'));
        window.setTimeout(updateActiveTocLink, 120);
      };

      if (isMobile()) {
        closeMobileToc();
        window.setTimeout(scrollToTarget, 80);
      } else {
        scrollToTarget();
      }
    });
  }

  // In mobile drawer mode, clicking outside the drawer closes it.
  document.addEventListener('click', (event) => {
    if (!lessonToc || !lessonTocDetails || !isMobile() || !lessonTocDetails.open) return;

    const clickedInsideDetails = lessonTocDetails.contains(event.target);

    if (!clickedInsideDetails) {
      closeMobileToc();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMobileToc();
    }
  });

  if (lessonTocNav) {
    updateActiveTocLink();

    window.addEventListener('scroll', () => {
      updateActiveTocLink();
    }, { passive: true });

    window.addEventListener('resize', () => {
      if (lessonTocDetails) {
        if (isMobile()) {
          lessonTocDetails.removeAttribute('open');
        } else {
          lessonTocDetails.setAttribute('open', '');
        }
      }

      syncTocOpenState();
      updateActiveTocLink();
      keepActiveLinkVisible();
    });
  }

  function buildDafUrl(fileName) {
    return `${BASE_PATH}/assets/daf/${encodeURIComponent(fileName)}`;
  }

  function getFileExtension(fileName) {
    const cleanName = String(fileName || '').split('?')[0].split('#')[0];
    const dotIndex = cleanName.lastIndexOf('.');
    return dotIndex >= 0 ? cleanName.slice(dotIndex + 1).toLowerCase() : '';
  }

  function parseMarks(rawMarks) {
    if (!rawMarks) return [];

    return rawMarks
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.split(',').map((part) => Number(part.trim())))
      .filter((parts) => parts.length === 4 && parts.every((value) => Number.isFinite(value)))
      .map(([left, top, width, height]) => ({ left, top, width, height }));
  }

  function addMarks(wrapper, rawMarks) {
    const marks = parseMarks(rawMarks);
    if (!marks.length) return;

    const overlay = document.createElement('div');
    overlay.className = 'daf-marks-layer';

    marks.forEach((mark) => {
      const el = document.createElement('span');
      el.className = 'daf-mark';
      el.style.left = `${mark.left}%`;
      el.style.top = `${mark.top}%`;
      el.style.width = `${mark.width}%`;
      el.style.height = `${mark.height}%`;
      overlay.appendChild(el);
    });

    wrapper.appendChild(overlay);
  }

  function renderImageDaf(card, fileName, alt, caption, marks) {
    const figure = card.querySelector('figure');
    const url = buildDafUrl(fileName);

    const img = new Image();

    img.onload = () => {
      img.alt = alt;
      img.loading = 'lazy';

      const wrapper = document.createElement('div');
      wrapper.className = 'daf-display daf-image-display';
      wrapper.appendChild(img);
      addMarks(wrapper, marks);

      figure.innerHTML = '';
      figure.appendChild(wrapper);

      const cap = document.createElement('figcaption');
      cap.textContent = caption;
      figure.appendChild(cap);
    };

    img.onerror = () => {
      card.classList.add('is-missing');
    };

    img.src = url;
  }

  function renderPdfDaf(card, fileName, caption, marks) {
    const figure = card.querySelector('figure');
    const url = buildDafUrl(fileName);

    const wrapper = document.createElement('div');
    wrapper.className = 'daf-display daf-pdf-display';

    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.title = caption || fileName;
    iframe.loading = 'lazy';

    wrapper.appendChild(iframe);
    addMarks(wrapper, marks);

    figure.innerHTML = '';
    figure.appendChild(wrapper);

    const cap = document.createElement('figcaption');
    cap.textContent = caption;
    figure.appendChild(cap);
  }

  document.querySelectorAll('.daf-card').forEach((card) => {
    const fileName = card.dataset.dafFile;
    const legacyName = card.dataset.dafImage;
    const caption = card.dataset.dafCaption || 'תמונת הדף הנלמד.';
    const alt = card.dataset.dafAlt || caption;
    const marks = card.dataset.dafMarks || '';

    if (fileName) {
      const extension = getFileExtension(fileName);

      if (extension === 'pdf') {
        renderPdfDaf(card, fileName, caption, marks);
        return;
      }

      if (['webp', 'png', 'jpg', 'jpeg'].includes(extension)) {
        renderImageDaf(card, fileName, alt, caption, marks);
        return;
      }

      card.classList.add('is-missing');
      return;
    }

    // Backward compatibility for the old metadata field: daf_image: "001"
    if (legacyName) {
      const candidates = [`${legacyName}.webp`, `${legacyName}.png`];
      let index = 0;

      const tryNext = () => {
        if (index >= candidates.length) {
          card.classList.add('is-missing');
          return;
        }

        const candidate = candidates[index];
        index += 1;

        const testImg = new Image();
        testImg.onload = () => renderImageDaf(card, candidate, alt, caption, marks);
        testImg.onerror = tryNext;
        testImg.src = buildDafUrl(candidate);
      };

      tryNext();
    }
  });
});
