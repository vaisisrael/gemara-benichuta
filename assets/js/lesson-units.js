(() => {
  'use strict';

  const wrappers = Array.from(document.querySelectorAll('.lesson-unit-wrap'));
  if (!wrappers.length) return;

  function closeAll(except = null) {
    wrappers.forEach((wrapper) => {
      if (wrapper === except) return;
      wrapper.classList.remove('is-open');
      wrapper.querySelector('[data-lesson-unit-trigger]')?.setAttribute('aria-expanded', 'false');
    });
  }

  wrappers.forEach((wrapper) => {
    const trigger = wrapper.querySelector('[data-lesson-unit-trigger]');
    if (!trigger) return;

    function toggle(event) {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !wrapper.classList.contains('is-open');
      closeAll(wrapper);
      wrapper.classList.toggle('is-open', willOpen);
      trigger.setAttribute('aria-expanded', String(willOpen));
    }

    trigger.addEventListener('click', toggle);
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') toggle(event);
      if (event.key === 'Escape') {
        wrapper.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.blur();
      }
    });
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.lesson-unit-wrap')) closeAll();
  });
})();
