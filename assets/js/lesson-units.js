(() => {
  'use strict';

  const wrappers = Array.from(document.querySelectorAll('.lesson-unit-wrap'));

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

  if (wrappers.length) {
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.lesson-unit-wrap')) closeAll();
    });
  }

  const audioDetails = Array.from(document.querySelectorAll('.lesson-row-audio'));
  if (!audioDetails.length) return;

  const style = document.createElement('style');
  style.textContent = `
    .lesson-list-item{position:relative}
    .lesson-list-item:has(.lesson-row[hidden]){display:none}

    .lesson-row-audio{margin:0;font:inherit}
    .lesson-row-audio > summary{display:none}

    .lesson-audio-icon{
      flex:0 0 auto;
      display:grid;
      place-items:center;
      width:34px;
      height:34px;
      border:1px solid rgba(201,168,106,.75);
      border-radius:999px;
      background:rgba(201,168,106,.16);
      color:var(--brand-dark);
      cursor:pointer;
      font:inherit;
      font-family:inherit;
      font-size:18px;
      line-height:1;
    }
    .lesson-audio-icon:hover{background:rgba(201,168,106,.26)}
    .lesson-audio-icon:focus-visible{
      outline:3px solid rgba(201,168,106,.55);
      outline-offset:3px;
    }
    .lesson-audio-icon[aria-expanded="true"]{background:var(--box)}

    .lesson-row-audio-player{
      margin-top:-18px;
      padding:0 22px 18px;
      background:var(--white);
      border:1px solid rgba(63,95,74,.14);
      border-top:0;
      border-radius:0 0 var(--radius) var(--radius);
      box-shadow:0 10px 30px rgba(31,41,51,.06);
    }
    .lesson-row-audio-player audio{
      display:block;
      width:100%;
      max-width:100%;
    }
    .lesson-list-item:has(.lesson-row-audio[open]) > .lesson-row{
      border-bottom-left-radius:0;
      border-bottom-right-radius:0;
      border-bottom-color:transparent;
      box-shadow:none;
    }

    @media (max-width:850px){
      .lesson-audio-icon{
        width:32px;
        height:32px;
        font-size:17px;
      }
      .lesson-row-audio-player{
        margin-top:-14px;
        padding:0 18px 16px;
      }
    }
  `;
  document.head.append(style);

  audioDetails.forEach((details) => {
    const item = details.closest('.lesson-list-item');
    const titleLine = item?.querySelector('.lesson-title-line');
    if (!item || !titleLine) return;

    const icon = document.createElement('span');
    icon.className = 'lesson-audio-icon';
    icon.setAttribute('role', 'button');
    icon.setAttribute('tabindex', '0');
    icon.setAttribute('aria-label', 'האזנה לשיעור');
    icon.setAttribute('title', 'האזנה לשיעור');
    icon.setAttribute('aria-expanded', 'false');
    icon.textContent = '🎧';
    titleLine.append(icon);

    function toggleAudio(event) {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !details.open;
      details.open = willOpen;
      icon.setAttribute('aria-expanded', String(willOpen));
    }

    icon.addEventListener('click', toggleAudio);
    icon.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        toggleAudio(event);
      } else if (event.key === 'Escape' && details.open) {
        event.preventDefault();
        event.stopPropagation();
        details.open = false;
        icon.setAttribute('aria-expanded', 'false');
        icon.blur();
      }
    });

    details.addEventListener('toggle', () => {
      icon.setAttribute('aria-expanded', String(details.open));
    });
  });
})();
