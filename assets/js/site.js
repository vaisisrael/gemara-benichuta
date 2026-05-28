document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#main-nav');

  if (btn && nav) {
    btn.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(isOpen));
    });
  }

  document.querySelectorAll('.site-footer p').forEach((p, index) => {
    if (index > 0 || p.textContent.includes('/en/') || p.textContent.includes('אנגלית')) {
      p.remove();
    }
  });

  const lessonToc = document.querySelector('.lesson-toc');
  const lessonTocDetails = document.querySelector('.lesson-toc details');
  const lessonTocNav = document.querySelector('.lesson-toc nav');
  const lessonTitle = document.querySelector('.lesson-article h1');

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

  const getStickyOffset = () => {
    const header = document.querySelector('.site-header');
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    return headerHeight + 14;
  };

  if (lessonToc) {
    lessonToc.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;

      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;

      event.preventDefault();

      const targetY = target.getBoundingClientRect().top + window.scrollY - getStickyOffset();
      window.scrollTo({ top: Math.max(targetY, 0), behavior: 'smooth' });

      if (lessonTocDetails && window.matchMedia('(max-width: 850px)').matches) {
        lessonTocDetails.removeAttribute('open');
      }

      history.replaceState(null, '', link.getAttribute('href'));
    });
  }

  const updateActiveTocLink = () => {
    const tocLinks = Array.from(document.querySelectorAll('.lesson-toc nav a[href^="#"]'));
    if (!tocLinks.length) return;

    const offset = getStickyOffset() + 12;
    let activeLink = tocLinks[0];

    tocLinks.forEach((link) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;

      if (target.getBoundingClientRect().top <= offset) {
        activeLink = link;
      }
    });

    tocLinks.forEach((link) => link.classList.toggle('is-active', link === activeLink));
  };

  if (document.querySelector('.lesson-toc nav')) {
    updateActiveTocLink();
    window.addEventListener('scroll', updateActiveTocLink, { passive: true });
    window.addEventListener('resize', updateActiveTocLink);
  }

  document.querySelectorAll('.daf-card[data-daf-image]').forEach((card) => {
    const name = card.dataset.dafImage;
    const alt = card.dataset.dafAlt || '';
    const candidates = [
      `/gemara-benichuta/assets/daf/${name}.webp`,
      `/gemara-benichuta/assets/daf/${name}.png`
    ];

    const figure = card.querySelector('figure');

    const tryImage = (index) => {
      if (index >= candidates.length) {
        card.classList.add('is-missing');
        return;
      }

      const img = new Image();

      img.onload = () => {
        img.alt = alt;
        img.loading = 'lazy';
        figure.innerHTML = '';
        figure.appendChild(img);

        const cap = document.createElement('figcaption');
        cap.textContent = `תמונת הדף לשיעור ${name}.\nאין צורך להבין את כל הדף; הסימון מצביע על הקטע הנלמד.`;
        figure.appendChild(cap);
      };

      img.onerror = () => tryImage(index + 1);
      img.src = candidates[index];
    };

    tryImage(0);
  });
});
