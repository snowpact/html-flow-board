import { inEpic, state } from '../core/state';
import { Epic, Screen } from '../core/types';
import { setFocus } from '../focus';
import { ICON_CHEVRON, ICON_LAYERS, ICON_SLIDERS, ICON_X } from './icons';
import { showEpicsModal } from './toolbar';

// Epic picker: look at the whole board, or focus one epic (its screens only).
// A tiny custom dropdown (colored dots + counts + type-to-filter + keyboard), built
// once per model change and only shown/hidden afterwards — no per-open DOM work.

var FILTER_MIN_ITEMS = 8; // show the filter box only for longer menus

interface ViewItem { value: string; label: string; color: string; count: number; kind: string; }

function currentValue(): string {
  return state.focus ? state.focus.id : '';
}

function listItems(): ViewItem[] {
  var screens: Screen[] = (state.project && state.project.screens) || [];
  var items: ViewItem[] = [{ value: '', label: 'All screens', color: '', count: screens.length, kind: 'all' }];
  ((state.project && state.project.epics) || []).forEach(function (e: Epic) {
    var n = 0;
    screens.forEach(function (s) { if (inEpic(s, e.id)) n++; });
    items.push({ value: e.id, label: e.label || e.id, color: e.color || '#666', count: n, kind: 'epic' });
  });
  return items;
}

var pickerEl: HTMLElement | null = null;
var outsideHandler: ((e: MouseEvent) => void) | null = null;

function isOpen(): boolean {
  return !!pickerEl && pickerEl.classList.contains('fb-open');
}

export function closeViewMenu(): void {
  if (!pickerEl) return;
  pickerEl.classList.remove('fb-open');
  var btn = pickerEl.querySelector('.fb-view-btn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
  if (outsideHandler) { document.removeEventListener('mousedown', outsideHandler, true); outsideHandler = null; }
}

function visibleOptions(): HTMLElement[] {
  var all = pickerEl.querySelectorAll('.fb-view-item');
  var out: HTMLElement[] = [];
  for (var i = 0; i < all.length; i++) if (!(all[i] as HTMLElement).hidden) out.push(all[i] as HTMLElement);
  return out;
}

function setActive(el: HTMLElement | null): void {
  var prev = pickerEl.querySelector('.fb-view-item.fb-active');
  if (prev) prev.classList.remove('fb-active');
  if (el) { el.classList.add('fb-active'); el.scrollIntoView && el.scrollIntoView({ block: 'nearest' }); }
}

export function openViewMenu(): void {
  if (!pickerEl || isOpen()) return;
  pickerEl.classList.add('fb-open');
  pickerEl.querySelector('.fb-view-btn').setAttribute('aria-expanded', 'true');
  var search = pickerEl.querySelector('.fb-view-search') as HTMLInputElement;
  if (search) { search.value = ''; applyFilter(''); search.focus(); }
  setActive(pickerEl.querySelector('.fb-view-item[data-view="' + currentValue() + '"]') as HTMLElement);
  outsideHandler = function (e: MouseEvent) {
    if (pickerEl && !pickerEl.contains(e.target as Node)) closeViewMenu();
  };
  document.addEventListener('mousedown', outsideHandler, true);
}

function applyFilter(q: string): void {
  var needle = q.trim().toLowerCase();
  var items = pickerEl.querySelectorAll('.fb-view-item');
  for (var i = 0; i < items.length; i++) {
    var it = items[i] as HTMLElement;
    it.hidden = !!needle && (it.getAttribute('data-label') || '').indexOf(needle) === -1;
  }
  var sections = pickerEl.querySelectorAll('.fb-view-section');
  for (var j = 0; j < sections.length; j++) {
    var sec = sections[j] as HTMLElement;
    var kind = sec.getAttribute('data-kind');
    var any = pickerEl.querySelector('.fb-view-item[data-kind="' + kind + '"]:not([hidden])');
    sec.hidden = !any;
  }
  var first = visibleOptions()[0] || null;
  setActive(first);
}

function choose(value: string): void {
  closeViewMenu();
  if (value !== currentValue()) setFocus(value);
}

function onKey(e: KeyboardEvent): void {
  if (!isOpen()) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openViewMenu(); }
    return;
  }
  var opts = visibleOptions();
  var cur = pickerEl.querySelector('.fb-view-item.fb-active') as HTMLElement;
  var idx = opts.indexOf(cur);
  if (e.key === 'ArrowDown') { e.preventDefault(); setActive(opts[Math.min(opts.length - 1, idx + 1)] || null); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(opts[Math.max(0, idx - 1)] || null); }
  else if (e.key === 'Enter') { e.preventDefault(); if (cur) choose(cur.getAttribute('data-view')); }
  else if (e.key === 'Escape') { e.preventDefault(); closeViewMenu(); (pickerEl.querySelector('.fb-view-btn') as HTMLElement).focus(); }
  e.stopPropagation();
}

function dot(color: string): string {
  return color ? '<span class="fb-view-dot" style="background:' + color + '"></span>' : '<span class="fb-view-dot fb-view-dot-all">' + ICON_LAYERS + '</span>';
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Update the button face (label, dot, clear chip) from state.focus. Cheap.
export function syncViewPicker(): void {
  if (!pickerEl) return;
  var val = currentValue();
  var item = null as ViewItem | null;
  listItems().forEach(function (it) { if (it.value === val) item = it; });
  var face = pickerEl.querySelector('.fb-view-face') as HTMLElement;
  var kindLabel = 'Epic';
  face.innerHTML = dot(item ? item.color : '') + '<span class="fb-view-kind">' + kindLabel + '</span>'
    + '<span class="fb-view-label">' + esc(item ? item.label : 'All screens') + '</span>';
  pickerEl.classList.toggle('fb-view-focused', !!state.focus);
  var items = pickerEl.querySelectorAll('.fb-view-item');
  for (var i = 0; i < items.length; i++) {
    var sel = items[i].getAttribute('data-view') === val;
    items[i].classList.toggle('fb-selected-item', sel);
    items[i].setAttribute('aria-selected', sel ? 'true' : 'false');
  }
}

export function renderViewPicker(): HTMLElement {
  closeViewMenu();
  var wrap = document.createElement('div');
  wrap.className = 'fb-view';
  wrap.setAttribute('data-testid', 'view-picker');

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fb-view-btn';
  btn.setAttribute('data-testid', 'view-btn');
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<span class="fb-view-face"></span><span class="fb-view-chevron">' + ICON_CHEVRON + '</span>';
  btn.addEventListener('click', function () { isOpen() ? closeViewMenu() : openViewMenu(); });
  btn.addEventListener('keydown', onKey);
  wrap.appendChild(btn);

  var clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'fb-view-clear';
  clear.title = 'Back to all screens';
  clear.setAttribute('data-testid', 'view-clear');
  clear.innerHTML = ICON_X;
  clear.addEventListener('click', function () { choose(''); });
  wrap.appendChild(clear);

  var menu = document.createElement('div');
  menu.className = 'fb-view-menu';
  menu.setAttribute('role', 'listbox');

  var items = listItems();
  if (items.length > FILTER_MIN_ITEMS) {
    var search = document.createElement('input');
    search.type = 'text';
    search.className = 'fb-view-search';
    search.placeholder = 'Filter epics…';
    search.addEventListener('input', function () { applyFilter(search.value); });
    search.addEventListener('keydown', onKey);
    search.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    menu.appendChild(search);
  }

  var html = '';
  var lastKind = '';
  var titles: Record<string, string> = { epic: 'Epics' };
  items.forEach(function (it) {
    if (it.kind !== 'all' && it.kind !== lastKind) {
      html += '<div class="fb-view-section" data-kind="' + it.kind + '">' + titles[it.kind] + '</div>';
      lastKind = it.kind;
    }
    html += '<div class="fb-view-item" role="option" data-view="' + esc(it.value) + '" data-kind="' + it.kind + '"'
      + ' data-label="' + esc(it.label.toLowerCase()) + '">' + dot(it.color)
      + '<span class="fb-view-item-label">' + esc(it.label) + '</span>'
      + '<span class="fb-view-count">' + it.count + '</span></div>';
  });
  var list = document.createElement('div');
  list.className = 'fb-view-list';
  list.innerHTML = html;
  list.addEventListener('click', function (e: MouseEvent) {
    var it = (e.target as HTMLElement).closest('.fb-view-item') as HTMLElement;
    if (it) choose(it.getAttribute('data-view'));
  });
  list.addEventListener('mousemove', function (e: MouseEvent) {
    var it = (e.target as HTMLElement).closest('.fb-view-item') as HTMLElement;
    if (it && !it.classList.contains('fb-active')) setActive(it);
  });
  menu.appendChild(list);

  var foot = document.createElement('button');
  foot.type = 'button';
  foot.className = 'fb-view-foot';
  foot.setAttribute('data-testid', 'epics-btn');
  foot.innerHTML = ICON_SLIDERS + '<span>Manage epics</span>';
  foot.addEventListener('click', function () { closeViewMenu(); showEpicsModal(); });
  menu.appendChild(foot);

  wrap.appendChild(menu);
  pickerEl = wrap;
  syncViewPicker();
  return wrap;
}
