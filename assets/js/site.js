document.addEventListener('DOMContentLoaded', () => {
  /* הסרת הערת תכנון פנימית מן הפוטר, אם נשארה בדפי HTML ישנים */
  document.querySelectorAll('.site-footer').forEach((footer) => {
    footer.querySelectorAll('p').forEach((paragraph, index) => {
      const text = paragraph.textContent || '';
      if (index > 0 || text.includes('/en/') || text.includes('אנגלית') || text.includes('English')) {
        paragraph.remove();
      }
    });
  });

  const btn = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#main-nav');

  if (btn && nav) {
    btn.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(isOpen));
    });
  }

  /* סגירה אמינה של ניווט השיעור הצף אחרי בחירת סעיף במובייל */
  document.addEventListener('click', (event) => {
    const lessonLink = event.target.closest('.lesson-toc a');

    if (!lessonLink || !window.matchMedia('(max-width: 850px)').matches) {
      return;
    }

    const details = lessonLink.closest('details');

    if (details) {
      details.open = false;
      details.removeAttribute('open');
      lessonLink.blur();

      /* גיבוי למקרה שהדפדפן פותח מחדש בזמן קפיצה לעוגן */
      window.setTimeout(() => {
        details.open = false;
        details.removeAttribute('open');
      }, 60);
    }
  });

  document.querySelectorAll('.daf-card[data-daf-image]').forEach((card) => {
    const name = card.dataset.dafImage;
    const alt = card.dataset.dafAlt || '';
    const candidates = [
      `/gemara-benichuta/assets/daf/${name}.webp`,
      `/gemara-benichuta/assets/daf/${name}.png`
    ];

    const figure = card.querySelector('figure');

    if (!figure) {
      return;
    }

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
