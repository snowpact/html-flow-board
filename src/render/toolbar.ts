import { drawArrows } from '../arrows';
import { cycleLayout, doReset } from '../board';
import { ZOOM_STEP } from '../core/constants';
import { getEpic, inEpic, screenEpics, setEpicList, state } from '../core/state';
import { saveHiddenScreens } from '../core/storage';
import { doExport } from '../export';
import { setZoom } from '../interactions/transform';
import { LAYOUT_STRATEGIES } from '../layout';
import { ICON_DOWNLOAD, ICON_FIT, ICON_GRID, ICON_MINUS, ICON_PLUS, ICON_RESET, ICON_TRASH } from './icons';
import { applyScreenVisibility } from './screen';
import { renderViewPicker } from './view-picker';
import { refreshScreenEpics } from './screen';
import { exitFocus } from '../focus';
import { fitToContent } from '../interactions/transform';
import { Epic, Screen } from '../core/types';

export function updateLayoutButton(): void {
  var btn = document.getElementById('fb-layout-btn');
  if (btn) {
    var name = btn.querySelector('.fb-layout-name');
    if (name) name.textContent = LAYOUT_STRATEGIES[state.layoutIndex].name;
  }
}

// Refresh the toolbar pieces that depend on the project model (title + legend),
// used after a text → diagram rebuild changes epics/name. No-op before init.
export function syncToolbar(): void {
  if (!state.container) return;
  var title = state.container.querySelector('.fb-project-title');
  if (title) title.textContent = state.project.name || 'FlowBoard';
  // Stories / epics feed the View picker: rebuild it (it is small, and only on a
  // model change — never on hover, drag or zoom).
  var oldView = state.container.querySelector('.fb-view');
  if (oldView && oldView.parentNode) oldView.parentNode.replaceChild(renderViewPicker(), oldView);
}

// -- Epic management (add / rename / delete) --

var EPIC_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];

function uniqueEpicId(): string {
  var epics: Epic[] = (state.project && state.project.epics) || [];
  var n = 1;
  var id: string;
  do { id = 'epic-' + n++; } while (epics.some(function (e: Epic) { return e.id === id; }));
  return id;
}

// Add a new epic (default name + next palette color); returns it.
export function addEpic(): Epic {
  if (!state.project.epics) state.project.epics = [];
  var epic: Epic = {
    id: uniqueEpicId(),
    label: 'Epic ' + (state.project.epics.length + 1),
    color: EPIC_PALETTE[state.project.epics.length % EPIC_PALETTE.length],
  };
  state.project.epics.push(epic);
  syncToolbar();
  if (state.commit) state.commit();
  return epic;
}

export function setEpicLabel(id: string, label: string): void {
  var epic = getEpic(id);
  if (!epic) return;
  epic.label = label;
  syncToolbar();
  if (state.commit) state.commit();
}

// Recolor an epic: update the model, its screens' headers, and the legend.
export function setEpicColor(id: string, color: string): void {
  var epic = getEpic(id);
  if (!epic) return;
  epic.color = color;
  (state.project.screens || []).forEach(function (s: Screen) {
    if (inEpic(s, id)) refreshScreenEpics(s);
  });
  syncToolbar();
  if (state.commit) state.commit();
}

// Delete an epic; its screens stay but lose the group (header turns grey).
// Returns true if it was deleted (false if cancelled / not found).
export function deleteEpic(id: string): boolean {
  if (!state.project || !state.project.epics) return false;
  var epic = getEpic(id);
  if (!epic) return false;
  if (!confirm('Delete epic "' + (epic.label || id) + '"? Its screens stay but lose this group.')) return false;
  state.project.epics = state.project.epics.filter(function (e: Epic) { return e.id !== id; });
  delete state.hiddenEpics[id];
  (state.project.screens || []).forEach(function (s: Screen) {
    if (inEpic(s, id)) {
      setEpicList(s, screenEpics(s).filter(function (e) { return e !== id; }));
      refreshScreenEpics(s);
    }
  });
  if (state.focus && state.focus.id === id) exitFocus();
  syncToolbar();
  drawArrows();
  if (state.commit) state.commit();
  return true;
}

// -- Manage-epics popup (scrollable list; inline name + color edit; add/delete) --

var epicsModalEl: HTMLElement | null = null;
var epicsDismiss: ((e: Event) => void) | null = null;

export function closeEpicsModal(): void {
  if (epicsModalEl && epicsModalEl.parentNode) epicsModalEl.parentNode.removeChild(epicsModalEl);
  epicsModalEl = null;
  if (epicsDismiss) { document.removeEventListener('keydown', epicsDismiss, true); epicsDismiss = null; }
}

function epicRow(epic: Epic): HTMLElement {
  var row = document.createElement('div');
  row.className = 'fb-epic-row';
  row.setAttribute('data-testid', 'epic-row-' + epic.id);

  var color = document.createElement('input');
  color.type = 'color';
  color.className = 'fb-epic-color';
  color.value = epic.color || '#666666';
  color.title = 'Color';
  color.addEventListener('input', function () { setEpicColor(epic.id, color.value); });
  row.appendChild(color);

  var name = document.createElement('input');
  name.type = 'text';
  name.className = 'fb-epic-name';
  name.value = epic.label || '';
  name.addEventListener('input', function () { epic.label = name.value; }); // live model
  name.addEventListener('change', function () { setEpicLabel(epic.id, name.value.trim() || epic.id); });
  row.appendChild(name);

  var del = document.createElement('button');
  del.className = 'fb-epic-del';
  del.title = 'Delete epic';
  del.setAttribute('data-testid', 'epic-del-' + epic.id);
  del.innerHTML = ICON_TRASH;
  del.addEventListener('click', function () {
    if (deleteEpic(epic.id) && row.parentNode) row.parentNode.removeChild(row);
  });
  row.appendChild(del);
  return row;
}

export function showEpicsModal(): void {
  closeEpicsModal();

  var backdrop = document.createElement('div');
  backdrop.className = 'fb-modal-backdrop';
  backdrop.setAttribute('data-testid', 'epics-modal');

  var modal = document.createElement('div');
  modal.className = 'fb-epics-modal';

  var header = document.createElement('div');
  header.className = 'fb-epics-modal-header';
  var h = document.createElement('span');
  h.textContent = 'Epics';
  header.appendChild(h);
  var close = document.createElement('button');
  close.className = 'fb-epics-modal-close';
  close.textContent = '×';
  close.title = 'Close';
  close.addEventListener('click', closeEpicsModal);
  header.appendChild(close);
  modal.appendChild(header);

  var list = document.createElement('div');
  list.className = 'fb-epics-list';
  (state.project.epics || []).forEach(function (epic: Epic) { list.appendChild(epicRow(epic)); });
  modal.appendChild(list);

  var add = document.createElement('button');
  add.className = 'fb-epics-add';
  add.setAttribute('data-testid', 'epic-add');
  add.innerHTML = ICON_PLUS + '<span>Add epic</span>';
  add.addEventListener('click', function () {
    var row = epicRow(addEpic());
    list.appendChild(row);
    var input = row.querySelector('.fb-epic-name') as HTMLInputElement;
    if (input) { input.focus(); input.select(); }
  });
  modal.appendChild(add);

  backdrop.appendChild(modal);
  backdrop.addEventListener('mousedown', function (e: MouseEvent) { if (e.target === backdrop) closeEpicsModal(); });
  document.body.appendChild(backdrop);
  epicsModalEl = backdrop;

  epicsDismiss = function (e: Event) { if ((e as KeyboardEvent).key === 'Escape') closeEpicsModal(); };
  document.addEventListener('keydown', epicsDismiss, true);
}

// -- Toolbar --

function el(tag: string, cls: string, html?: string): HTMLElement {
  var e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

// A labelled on/off switch (a styled checkbox: no JS beyond the change handler).
function makeSwitch(text: string, checked: boolean, title: string, testid: string, onChange: (on: boolean) => void): HTMLElement {
  var label = el('label', 'fb-switch');
  label.title = title;
  var cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  if (testid) cb.setAttribute('data-testid', testid);
  cb.addEventListener('change', function () { onChange(cb.checked); });
  label.appendChild(cb);
  label.appendChild(el('span', 'fb-switch-track'));
  label.appendChild(document.createTextNode(text));
  return label;
}

function iconBtn(cls: string, icon: string, title: string, onClick: () => void): HTMLButtonElement {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.title = title;
  b.innerHTML = icon;
  b.addEventListener('click', onClick);
  return b;
}

export function renderToolbar(): HTMLElement {
  var header = el('div', 'fb-header');

  // Left: title + View picker (whole board / story / epic)
  var left = el('div', 'fb-toolbar-group');
  var title = el('span', 'fb-project-title');
  title.textContent = state.project.name || 'FlowBoard';
  left.appendChild(title);
  left.appendChild(renderViewPicker());
  header.appendChild(left);

  // Right: display switches · zoom · layout / export / reset
  var right = el('div', 'fb-toolbar-group');

  var switches = el('div', 'fb-switches');
  switches.appendChild(makeSwitch('Notes', state.showNotes, 'Show screen notes', 'toggle-notes', function (on) {
    state.showNotes = on;
    toggleNotesVisibility();
  }));
  switches.appendChild(makeSwitch('Nav', state.showNav !== false, 'Show navigation arrows (menus, back links)', 'toggle-nav', function (on) {
    state.showNav = on;
    drawArrows();
  }));
  right.appendChild(switches);

  var zoom = el('div', 'fb-seg');
  zoom.appendChild(iconBtn('fb-toolbar-btn', ICON_MINUS, 'Zoom out', function () { setZoom(state.zoom - ZOOM_STEP); }));
  var zoomLabel = el('span', 'fb-zoom-label');
  zoomLabel.id = 'fb-zoom-label';
  zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
  zoom.appendChild(zoomLabel);
  zoom.appendChild(iconBtn('fb-toolbar-btn', ICON_PLUS, 'Zoom in', function () { setZoom(state.zoom + ZOOM_STEP); }));
  zoom.appendChild(iconBtn('fb-toolbar-btn', ICON_FIT, 'Fit to screen', function () { fitToContent(); }));
  right.appendChild(zoom);

  var layoutBtn = iconBtn('fb-action-btn', ICON_GRID + '<span class="fb-layout-name">' + LAYOUT_STRATEGIES[state.layoutIndex].name + '</span>', 'Auto-layout: switch strategy', cycleLayout);
  layoutBtn.id = 'fb-layout-btn';
  right.appendChild(layoutBtn);

  right.appendChild(iconBtn('fb-action-btn', ICON_DOWNLOAD + '<span>PNG</span>', 'Export as PNG', doExport));

  var resetBtn = iconBtn('fb-action-btn fb-ghost', ICON_RESET + '<span>Reset</span>', 'Reset to the default layout', doReset);
  resetBtn.setAttribute('data-testid', 'toolbar-reset');
  right.appendChild(resetBtn);

  header.appendChild(right);
  return header;
}

// -- Toggle notes visibility --
export function toggleNotesVisibility(): void {
  var footers = state.container.querySelectorAll('.fb-screen-footer');
  for (var i = 0; i < footers.length; i++) {
    if (state.showNotes) {
      footers[i].classList.remove('fb-hidden');
    } else {
      footers[i].classList.add('fb-hidden');
    }
  }
}

// -- Toggle epic visibility (shortcut: hides/shows each screen individually) --
export function toggleEpic(epicId: string): void {
  // If any screen of this epic is visible → hide all; otherwise show all
  var hasVisible = false;
  state.project.screens.forEach(function (s: Screen) {
    if (inEpic(s, epicId) && !state.hiddenScreens[s.id]) hasVisible = true;
  });
  var isHiding = hasVisible;

  if (isHiding) {
    state.hiddenEpics[epicId] = true;
  } else {
    delete state.hiddenEpics[epicId];
  }

  // Update legend item dimming
  var checkboxes = state.container.querySelectorAll('.fb-legend-checkbox');
  for (var i = 0; i < checkboxes.length; i++) {
    var cb = checkboxes[i] as HTMLInputElement;
    var item = cb.closest('.fb-legend-item') as HTMLElement;
    if (cb.dataset.epicId === epicId) {
      cb.checked = !isHiding;
      if (isHiding) {
        item.classList.add('fb-dimmed');
      } else {
        item.classList.remove('fb-dimmed');
      }
    }
  }

  // Toggle each screen of this epic individually
  state.project.screens.forEach(function (s: Screen) {
    if (!inEpic(s, epicId)) return;
    if (isHiding) {
      state.hiddenScreens[s.id] = true;
    } else {
      delete state.hiddenScreens[s.id];
    }
    applyScreenVisibility(s.id);
  });

  saveHiddenScreens();
  drawArrows();
}

// -- Toggle individual screen visibility --
