/* Desktop header actions menu: rehome original buttons, preserve their listeners.
 * Mobile retains the pre-existing hamburger and its header controls. */
(() => {
  'use strict';

  const toggle = document.getElementById('desktop-header-menu-toggle');
  const panel = document.getElementById('desktop-header-menu-panel');
  const items = document.getElementById('desktop-header-menu-items');
  const actions = document.querySelector('.top-actions');
  if (!toggle || !panel || !items || !actions) return;

  const actionIds = [
    'kvx-launch',                // Dynamically injected Intelligence suite
    'command-palette-button',
    'notification-button',
    'theme-toggle',
    'version-badge',
    'new-backup'
  ];
  const anchors = new Map();
  const desktop = () => window.matchMedia('(min-width: 1051px)').matches;

  function setOpen(open) {
    const next = Boolean(open && desktop());
    panel.classList.toggle('hidden', !next);
    toggle.setAttribute('aria-expanded', String(next));
    toggle.setAttribute('aria-label', next ? 'Close header actions' : 'Open header actions');
    toggle.title = next ? 'Close menu' : 'Open menu';
  }

  function syncActions() {
    if (desktop()) {
      for (const id of actionIds) {
        const el = document.getElementById(id);
        if (!el || el.parentElement !== actions) continue;
        // Remember the exact original position for restoring the mobile layout.
        const anchor = document.createComment('header position: ' + id);
        actions.insertBefore(anchor, el);
        anchors.set(id, anchor);
        if (id === 'kvx-launch') items.prepend(el);
        else items.appendChild(el);
      }
    } else {
      setOpen(false);
      for (const id of actionIds) {
        const el = document.getElementById(id);
        const anchor = anchors.get(id);
        if (el && el.parentElement === items && anchor?.parentElement === actions) {
          anchor.after(el);
        }
      }
    }
  }

  toggle.addEventListener('click', event => {
    event.stopPropagation();
    syncActions();
    setOpen(panel.classList.contains('hidden'));
  });

  panel.addEventListener('click', event => {
    if (event.target.closest('button')) setOpen(false);
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

  // The suite can add its button after the page has loaded.
  new MutationObserver(syncActions).observe(actions, { childList: true });
  window.addEventListener('resize', syncActions);
  syncActions();
})();
