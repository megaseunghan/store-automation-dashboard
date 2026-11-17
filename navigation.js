// One navigation tree serves the desktop sidebar and small-screen disclosure.
const sidebar = document.querySelector('.app-sidebar');
const toggle = document.querySelector('#navigationToggle');
const navigation = document.querySelector('#appNavigation');
const railToggle = document.querySelector('#sidebarToggle');
const shell = document.querySelector('.app-shell');
const compact = window.matchMedia('(max-width: 767px)');

function setExpanded(expanded) {
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.textContent = expanded ? '메뉴 닫기' : '메뉴';
  navigation.hidden = compact.matches && !expanded;
}

let railCollapsed = false;
function setRailCollapsed(collapsed) {
  railCollapsed = collapsed;
  shell?.classList.toggle('is-rail-collapsed', collapsed && !compact.matches);
  railToggle?.setAttribute('aria-expanded', String(!collapsed));
  railToggle?.setAttribute('aria-label', collapsed ? '메뉴 펼치기' : '메뉴 접기');
  const label = railToggle?.querySelector('.sidebar-toggle-label');
  if (label) label.textContent = collapsed ? '메뉴 펼치기' : '메뉴 접기';
}
function syncNavigation() {
  // A resize must never leave keyboard focus inside hidden navigation.
  const focused = document.activeElement;
  toggle.hidden = !compact.matches;
  if (railToggle) railToggle.hidden = compact.matches;
  setRailCollapsed(railCollapsed);
  if (compact.matches && focused === railToggle) toggle.focus();
  setExpanded(false);
  if (compact.matches && navigation.contains(focused)) toggle.focus();
  else if (!compact.matches && focused === toggle) {
    navigation.querySelector('[aria-current="page"]')?.focus();
  }
}

if (sidebar && toggle && navigation) {
  for (const link of navigation.querySelectorAll('[data-view-link]')) {
    // The visible label becomes a tooltip when the rail is collapsed.
    link.setAttribute('title', link.textContent.trim());
    link.setAttribute('aria-label', link.textContent.trim());
  }
  railToggle?.addEventListener('click', () => setRailCollapsed(!railCollapsed));
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
