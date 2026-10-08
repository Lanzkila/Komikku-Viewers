/* Desktop-only quick menu. The existing mobile hamburger is unchanged. */
(() => {
  'use strict';
  const toggle = document.getElementById('desktop-header-menu-toggle');
  const panel = document.getElementById('desktop-header-menu-panel');
  if (!toggle || !panel) return;

  const desktop = () => window.matchMedia('(min-width: 1051px)').matches;

  function setOpen(open) {
    const next = Boolean(open && desktop());
    panel.classList.toggle('hidden', !next);
    toggle.setAttribute('aria-expanded', String(next));
    toggle.setAttribute('aria-label', next ? 'Close quick menu' : 'Open quick menu');
    toggle.setAttribute('title', next ? 'Close menu' : 'Open menu');
  }

  toggle.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(panel.classList.contains('hidden'));
  });

  panel.addEventListener('click', event => {
    const link = event.target.closest('button[data-desktop-view], button[data-desktop-action]');
    if (!link) return;
    if (link.dataset.desktopView) {
      document.querySelector('#primary-nav .nav-btn[data-view="' + link.dataset.desktopView + '"]')?.click();
    } else {
      const targets = {
        appearance: 'theme-toggle',
        commands: 'command-palette-button',
        backup: 'new-backup'
      };
      document.getElementById(targets[link.dataset.desktopAction])?.click();
    }
    setOpen(false);
  });

  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.desktop-header-menu')) setOpen(false);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.classList.contains('hidden')) {
      setOpen(false);
      toggle.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (!desktop()) setOpen(false);
  });
})();
