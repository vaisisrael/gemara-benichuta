document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.site-footer p').forEach((paragraph) => {
    if (paragraph.textContent.includes('/en/')) {
      paragraph.remove();
    }
  });

  const btn = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#main-nav');

  if (btn && nav) {
    btn.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(isOpen));
    });
  }

  const lessonTocDetails = document.querySelector('.lesson-toc details');

  if (lessonTocDetails) {
    lessonTocDetails.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        if (window.matchMedia('(max-width: 850px)').matches) {
          lessonTocDetails.removeAttribute('open');
        }
      });
    });
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
        cap.textContent = `תמונת הדף לשיעור ${name}.
אין צורך להבין את כל הדף; הסימון מצביע על הקטע הנלמד.`;
        figure.appendChild(cap);
      };

      img.onerror = () => tryImage(index + 1);
      img.src = candidates[index];
    };

    tryImage(0);
  });
});
