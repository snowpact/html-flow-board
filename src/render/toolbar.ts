import { drawArrows } from '../arrows';
import { cycleLayout, doReset } from '../board';
import { ZOOM_STEP } from '../core/constants';
import { getEpic, state } from '../core/state';
import { saveHiddenScreens } from '../core/storage';
import { doExport } from '../export';
import { setZoom } from '../interactions/transform';
import { LAYOUT_STRATEGIES } from '../layout';
import { ICON_PLUS, ICON_TRASH } from './icons';
import { applyScreenVisibility } from './screen';
import { Epic, Screen } from '../core/types';

export function updateLayoutButton(): void {
  var btn = document.getElementById('fb-layout-btn');
  if (btn) {
    var name = LAYOUT_STRATEGIES[state.layoutIndex].name;
    btn.textContent = 'Auto-Layout (' + name + ')';
  }
}

// Build the epic legend (checkbox + color dot + label) from the current project.
export function renderLegend(): HTMLElement {
  var legend = document.createElement('div');
  legend.className = 'fb-legend';
  (state.project.epics || []).forEach(function (epic: Epic) {
    var label = document.createElement('label');
    label.className = 'fb-legend-item' + (state.hiddenEpics[epic.id] ? ' fb-dimmed' : '');

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !state.hiddenEpics[epic.id];
    cb.className = 'fb-legend-checkbox';
    cb.style.accentColor = epic.color;
    cb.dataset.epicId = epic.id;
    cb.addEventListener('change', function () {
      toggleEpic(epic.id);
    });
    label.appendChild(cb);

    var dot = document.createElement('span');
    dot.className = 'fb-legend-dot';
    dot.style.background = epic.color;
    label.appendChild(dot);
    label.appendChild(document.createTextNode(epic.label));
    legend.appendChild(label);
  });
  return legend;
}

// Refresh the toolbar pieces that depend on the project model (title + legend),
// used after a text → diagram rebuild changes epics/name. No-op before init.
export function syncToolbar(): void {
  if (!state.container) return;
  var title = state.container.querySelector('.fb-project-title');
  if (title) title.textContent = state.project.name || 'FlowBoard';
  var old = state.container.querySelector('.fb-legend');
  if (old && old.parentNode) old.parentNode.replaceChild(renderLegend(), old);
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
    if (s.epic === id) {
      var el = state.screenEls[s.id];
      if (el) { var hdr = el.querySelector('.fb-screen-header') as HTMLElement; if (hdr) hdr.style.background = color; }
    }
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
    if (s.epic === id) {
      delete s.epic;
      var el = state.screenEls[s.id];
      if (el) {
        var hdr = el.querySelector('.fb-screen-header') as HTMLElement;
        if (hdr) hdr.style.background = '#666';
      }
    }
  });
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

// -- Get epic by id --
export function renderToolbar(): HTMLElement {
  var header = document.createElement('div');
  header.className = 'fb-header';

  // Left: title + legend
  var left = document.createElement('div');
  left.className = 'fb-toolbar-group';

  var title = document.createElement('span');
  title.className = 'fb-project-title';
  title.textContent = state.project.name || 'FlowBoard';
  left.appendChild(title);

  // Separator
  var sep1 = document.createElement('div');
  sep1.className = 'fb-header-separator';
  left.appendChild(sep1);

  // Legend with checkboxes
  left.appendChild(renderLegend());

  // Manage epics (add / rename / delete)
  var epicsBtn = document.createElement('button');
  epicsBtn.className = 'fb-epics-btn';
  epicsBtn.title = 'Manage epics';
  epicsBtn.setAttribute('data-testid', 'epics-btn');
  epicsBtn.innerHTML = ICON_PLUS;
  epicsBtn.addEventListener('click', showEpicsModal);
  left.appendChild(epicsBtn);

  header.appendChild(left);

  // Right: controls
  var right = document.createElement('div');
  right.className = 'fb-toolbar-group';

  // Toggle notes
  var toggleLabel = document.createElement('label');
  toggleLabel.className = 'fb-toggle-label';
  var checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = state.showNotes;
  checkbox.addEventListener('change', function () {
    state.showNotes = checkbox.checked;
    toggleNotesVisibility();
  });
  toggleLabel.appendChild(checkbox);
  toggleLabel.appendChild(document.createTextNode('Notes'));
  right.appendChild(toggleLabel);

  // Separator
  var sep2 = document.createElement('div');
  sep2.className = 'fb-header-separator';
  right.appendChild(sep2);

  // Zoom out
  var zoomOut = document.createElement('button');
  zoomOut.className = 'fb-toolbar-btn';
  zoomOut.textContent = '−';
  zoomOut.title = 'Zoom out';
  zoomOut.addEventListener('click', function () { setZoom(state.zoom - ZOOM_STEP); });
  right.appendChild(zoomOut);

  // Zoom label
  var zoomLabel = document.createElement('span');
  zoomLabel.className = 'fb-zoom-label';
  zoomLabel.id = 'fb-zoom-label';
  zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
  right.appendChild(zoomLabel);

  // Zoom in
  var zoomIn = document.createElement('button');
  zoomIn.className = 'fb-toolbar-btn';
  zoomIn.textContent = '+';
  zoomIn.title = 'Zoom in';
  zoomIn.addEventListener('click', function () { setZoom(state.zoom + ZOOM_STEP); });
  right.appendChild(zoomIn);

  // Separator
  var sep3 = document.createElement('div');
  sep3.className = 'fb-header-separator';
  right.appendChild(sep3);

  // Auto-Layout (cycle)
  var layoutBtn = document.createElement('button');
  layoutBtn.className = 'fb-action-btn';
  layoutBtn.id = 'fb-layout-btn';
  layoutBtn.title = 'Change layout';
  layoutBtn.textContent = 'Auto-Layout (' + LAYOUT_STRATEGIES[state.layoutIndex].name + ')';
  layoutBtn.addEventListener('click', cycleLayout);
  right.appendChild(layoutBtn);

  // Export PNG
  var exportBtn = document.createElement('button');
  exportBtn.className = 'fb-action-btn';
  exportBtn.textContent = 'Export PNG';
  exportBtn.title = 'Export as PNG';
  exportBtn.addEventListener('click', doExport);
  right.appendChild(exportBtn);

  // Separator
  var sep4 = document.createElement('div');
  sep4.className = 'fb-header-separator';
  right.appendChild(sep4);

  // Reset
  var resetBtn = document.createElement('button');
  resetBtn.className = 'fb-action-btn';
  resetBtn.setAttribute('data-testid', 'toolbar-reset');
  resetBtn.textContent = 'Reset';
  resetBtn.title = 'Reset to the default layout';
  resetBtn.addEventListener('click', doReset);
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
    if (s.epic === epicId && !state.hiddenScreens[s.id]) hasVisible = true;
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
    if (s.epic !== epicId) return;
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
