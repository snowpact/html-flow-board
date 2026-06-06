// Reusable cursor-positioned menu with one level of submenu. Single instance:
// opening a new one closes the previous. Dismisses on outside click / Escape.
// Used by S2 (Créer, Modifier le layout) and later S3 (toolbar dropdown).

export interface CtxItem {
  label: string;
  onClick?: () => void;
  submenu?: CtxItem[];
  active?: boolean;
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
      + (item.submenu ? ' fb-ctx-has-sub' : '');

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
  // Defer so the opening interaction doesn't immediately dismiss it.
  setTimeout(function () {
    if (!dismiss) return;
    document.addEventListener('mousedown', dismiss, true);
    document.addEventListener('keydown', dismiss, true);
  }, 0);

  return menu;
}
