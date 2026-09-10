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
    .lesson-list-item:has(.lesson-row-audio) .lesson-title-line{padding-inline-end:44px}

    .lesson-row-audio{margin:0;font:inherit}
    .lesson-row-audio > summary{
      position:absolute;
      z-index:3;
      inset-inline-end:22px;
      top:22px;
      display:grid;
      place-items:center;
      width:34px;
      height:34px;
      margin:0;
      padding:0;
      border:1px solid rgba(201,168,106,.75);
      border-radius:999px;
      background:rgba(201,168,106,.16);
      color:var(--brand-dark);
      cursor:pointer;
      list-style:none;
      font:inherit;
      font-family:inherit;
      line-height:1;
    }
    .lesson-row-audio > summary::-webkit-details-marker{display:none}
    .lesson-row-audio > summary::marker{content:""}
    .lesson-row-audio > summary:hover{background:rgba(201,168,106,.26)}
    .lesson-row-audio > summary:focus-visible{
      outline:3px solid rgba(201,168,106,.55);
      outline-offset:3px;
    }
    .lesson-row-audio[open] > summary{background:var(--box)}

    .lesson-audio-sr{
      position:absolute;
      width:1px;
      height:1px;
      padding:0;
      margin:-1px;
      overflow:hidden;
      clip:rect(0,0,0,0);
      white-space:nowrap;
      border:0;
    }

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
      .lesson-list-item:has(.lesson-row-audio) .lesson-title-line{padding-inline-end:40px}
      .lesson-row-audio > summary{
        inset-inline-end:18px;
        top:18px;
        width:32px;
        height:32px;
      }
      .lesson-row-audio-player{
        margin-top:-14px;
        padding:0 18px 16px;
      }
    }
  `;
  document.head.append(style);

  audioDetails.forEach((details) => {
    const summary = details.querySelector(':scope > summary');
    if (!summary) return;

    summary.innerHTML = '<span aria-hidden="true">🎧</span><span class="lesson-audio-sr">האזנה לשיעור</span>';
    summary.setAttribute('title', 'האזנה לשיעור');
    summary.setAttribute('aria-label', 'האזנה לשיעור');
  });
})();
