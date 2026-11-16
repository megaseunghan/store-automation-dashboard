// One navigation tree serves the desktop sidebar and small-screen disclosure.
const sidebar = document.querySelector('.app-sidebar');
const toggle = document.querySelector('#navigationToggle');
const navigation = document.querySelector('#appNavigation');
const compact = window.matchMedia('(max-width: 767px)');

function setExpanded(expanded) {
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.textContent = expanded ? '메뉴 닫기' : '메뉴';
  navigation.hidden = compact.matches && !expanded;
}

function syncNavigation() {
  // A resize must never leave keyboard focus inside hidden navigation.
  const focused = document.activeElement;
  toggle.hidden = !compact.matches;
  setExpanded(false);
  if (compact.matches && navigation.contains(focused)) toggle.focus();
  else if (!compact.matches && focused === toggle) {
    navigation.querySelector('[aria-current="page"]')?.focus();
  }
}

if (sidebar && toggle && navigation) {
  toggle.addEventListener('click', () => {
    setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
  });
  sidebar.addEventListener('keydown', event => {
    if (event.key === 'Escape' && compact.matches && !navigation.hidden) {
      setExpanded(false);
      toggle.focus();
    }
  });
  navigation.addEventListener('click', event => {
    const link = event.target.closest('[data-view-link]');
    if (!link || !compact.matches || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    setExpanded(false);
    document.querySelector('.page-heading h1')?.focus({ preventScroll: true });
  });
  compact.addEventListener('change', syncNavigation);
  syncNavigation();
}
