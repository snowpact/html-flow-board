// Reusable cursor-positioned menu with one level of submenu. Single instance:
// opening a new one closes the previous. Dismisses on outside click / Escape.
// Used by the board "Create screen" menu and the screen "Change epic" menu.

export interface CtxItem {
  label: string;
  onClick?: () => void;
  submenu?: CtxItem[];
  active?: boolean;
  icon?: string;     // inline SVG (see icons.ts)
  danger?: boolean;  // red styling for destructive actions
  testid?: string;   // stable data-testid for tests
}

var openRoot: HTMLElement | null = null;
var dismiss: ((e: Event) => void) | null = null;

export function closeContextMenu(): void {
  if (openRoot && openRoot.parentNode) openRoot.parentNode.removeChild(openRoot);
  openRoot = null;
  if (dismiss) {
    document.removeEventListener('mousedown', dismiss, true);
    document.removeEventListener('keydown', dismiss, true);
    dismiss = null;
  }
}

function buildMenu(items: CtxItem[]): HTMLElement {
  var menu = document.createElement('div');
  menu.className = 'fb-ctx-menu';

  items.forEach(function (item: CtxItem) {
    var row = document.createElement('div');
    row.className = 'fb-ctx-item'
      + (item.active ? ' fb-ctx-active' : '')
      + (item.danger ? ' fb-ctx-danger' : '')
      + (item.submenu ? ' fb-ctx-has-sub' : '');
    if (item.testid) row.setAttribute('data-testid', item.testid);

    if (item.icon) {
      var ic = document.createElement('span');
      ic.className = 'fb-ctx-icon';
      ic.innerHTML = item.icon;
      row.appendChild(ic);
    }

    var label = document.createElement('span');
    label.className = 'fb-ctx-label';
    label.textContent = item.label;
    row.appendChild(label);

    if (item.submenu && item.submenu.length) {
      var caret = document.createElement('span');
      caret.className = 'fb-ctx-caret';
      caret.textContent = '▸'; // ▸
      row.appendChild(caret);

      row.addEventListener('mouseenter', function () {
        // only one submenu open at a time within this menu
        var existing = menu.querySelectorAll('.fb-ctx-sub');
        for (var i = 0; i < existing.length; i++) {
          var e = existing[i];
          if (e.parentNode) e.parentNode.removeChild(e);
        }
        var sub = buildMenu(item.submenu as CtxItem[]);
        sub.classList.add('fb-ctx-sub');
        row.appendChild(sub);
        // flip to the left if it would overflow the right edge
        if (sub.getBoundingClientRect().right > window.innerWidth) {
          sub.classList.add('fb-ctx-sub-left');
        }
      });
      row.addEventListener('mouseleave', function () {
        var s = row.querySelector('.fb-ctx-sub');
        if (s && s.parentNode) s.parentNode.removeChild(s);
      });
    } else {
      row.addEventListener('click', function (e: MouseEvent) {
        e.stopPropagation();
        closeContextMenu();
        if (item.onClick) item.onClick();
      });
    }

    menu.appendChild(row);
  });

  return menu;
}

export function showContextMenu(x: number, y: number, items: CtxItem[]): HTMLElement {
  closeContextMenu();

  var menu = buildMenu(items);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  document.body.appendChild(menu);
  openRoot = menu;

  // Keep it inside the viewport when layout info is available.
  var r = menu.getBoundingClientRect();
  if (r.width && r.right > window.innerWidth) menu.style.left = Math.max(0, x - r.width) + 'px';
  if (r.height && r.bottom > window.innerHeight) menu.style.top = Math.max(0, y - r.height) + 'px';

  dismiss = function (e: Event) {
    if (e.type === 'keydown') {
      if ((e as KeyboardEvent).key === 'Escape') closeContextMenu();
      return;
    }
    if (openRoot && !openRoot.contains(e.target as Node)) closeContextMenu();
  };
  // Defer so the opening interaction doesn't immediately dismiss it. Capture the
  // specific handler so a second menu opened in the same tick can't cross-wire.
  var fn = dismiss;
  setTimeout(function () {
    if (dismiss !== fn) return;
    document.addEventListener('mousedown', fn, true);
    document.addEventListener('keydown', fn, true);
  }, 0);

  return menu;
}
