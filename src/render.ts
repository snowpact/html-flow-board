// @ts-nocheck
import { cancelHideAnchors, scheduleHideAnchors, showAnchorDots } from './anchors';
import { drawArrows } from './arrows';
import { cycleLayout, doReset } from './board';
import { ICON_CURSOR, ICON_HAND, ZOOM_STEP } from './constants';
import { doExport, doExportConfig } from './export';
import { escapeHtml } from './geometry';
import { setMode, setZoom } from './interactions';
import { LAYOUT_STRATEGIES } from './layout';
import { showScreenPopup } from './popups';
import { getEpic, state } from './state';
import { saveHiddenScreens } from './storage';

export function updateLayoutButton() {
  var btn = document.getElementById('fb-layout-btn');
  if (btn) {
    var name = LAYOUT_STRATEGIES[state.layoutIndex].name;
    btn.textContent = 'Auto-Layout (' + name + ')';
  }
}

// -- Get epic by id --
export function renderToolbar() {
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
  var legend = document.createElement('div');
  legend.className = 'fb-legend';
  (state.project.epics || []).forEach(function (epic) {
    var label = document.createElement('label');
    label.className = 'fb-legend-item';

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
  left.appendChild(legend);

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
  layoutBtn.title = 'Changer la disposition';
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

  // Export Config
  var exportConfigBtn = document.createElement('button');
  exportConfigBtn.className = 'fb-action-btn';
  exportConfigBtn.textContent = 'Copy Init';
  exportConfigBtn.title = 'Copier le code FlowBoard.init() dans le presse-papier';
  exportConfigBtn.addEventListener('click', doExportConfig);
  right.appendChild(exportConfigBtn);

  // Separator
  var sep4 = document.createElement('div');
  sep4.className = 'fb-header-separator';
  right.appendChild(sep4);

  // Reset
  var resetBtn = document.createElement('button');
  resetBtn.className = 'fb-action-btn';
  resetBtn.textContent = 'Reset';
  resetBtn.title = 'Remettre la disposition par défaut';
  resetBtn.addEventListener('click', doReset);
  right.appendChild(resetBtn);

  header.appendChild(right);
  return header;
}

// -- Toggle notes visibility --
export function toggleNotesVisibility() {
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
export function toggleEpic(epicId) {
  // If any screen of this epic is visible → hide all; otherwise show all
  var hasVisible = false;
  state.project.screens.forEach(function (s) {
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
    var cb = checkboxes[i];
    var item = cb.closest('.fb-legend-item');
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
  state.project.screens.forEach(function (s) {
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
export function toggleScreen(screenId) {
  if (state.hiddenScreens[screenId]) {
    delete state.hiddenScreens[screenId];
  } else {
    state.hiddenScreens[screenId] = true;
  }
  applyScreenVisibility(screenId);
  saveHiddenScreens();
  drawArrows();
}

export function applyScreenVisibility(screenId) {
  var el = state.screenEls[screenId];
  if (!el) return;
  if (state.hiddenScreens[screenId]) {
    el.classList.add('fb-screen-dimmed');
    // A hidden screen can't stay selected.
    if (state.selected[screenId]) {
      delete state.selected[screenId];
      el.classList.remove('fb-selected');
    }
  } else {
    el.classList.remove('fb-screen-dimmed');
  }
}

// -- Render a single screen --
export function renderScreen(screenData) {
  var epic = getEpic(screenData.epic);
  var color = epic ? epic.color : '#666';
  var size = screenData.size || 'md';

  var el = document.createElement('div');
  el.className = 'fb-screen fb-size-' + size;
  el.dataset.screenId = screenData.id;

  // Position
  var pos = state.positions[screenData.id] || { x: 100, y: 100 };
  el.style.left = pos.x + 'px';
  el.style.top = pos.y + 'px';

  // Header
  var hdr = document.createElement('div');
  hdr.className = 'fb-screen-header';
  hdr.style.background = color;
  hdr.innerHTML = '<span>' + escapeHtml(screenData.title) + '</span>';

  var toggleBtn = document.createElement('button');
  toggleBtn.className = 'fb-screen-toggle';
  toggleBtn.title = 'Masquer cet écran';
  toggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  toggleBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleScreen(screenData.id);
  });
  hdr.appendChild(toggleBtn);

  el.appendChild(hdr);

  // Body
  var body = document.createElement('div');
  body.className = 'fb-screen-body';
  body.innerHTML = screenData.content || '';
  el.appendChild(body);

  // Footer (notes only)
  if (screenData.notes) {
    var footer = document.createElement('div');
    footer.className = 'fb-screen-footer' + (state.showNotes ? '' : ' fb-hidden');
    footer.textContent = screenData.notes;
    el.appendChild(footer);
  }

  // Apply dimmed state if screen is individually hidden
  if (state.hiddenScreens[screenData.id]) {
    el.classList.add('fb-screen-dimmed');
  }

  // Context menu (right-click)
  el.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    e.stopPropagation();
    showScreenPopup(e, screenData.id);
  });

  // Anchor dots on hover
  el.addEventListener('mouseenter', function () {
    if (!state.creatingArrow && !state.screenDrag && !state.selectBox) {
      cancelHideAnchors();
      showAnchorDots(screenData.id);
    }
  });
  el.addEventListener('mouseleave', function () {
    if (!state.creatingArrow) {
      scheduleHideAnchors();
    }
  });

  state.screenEls[screenData.id] = el;
  return el;
}

export function renderModeSwitch() {
  var sw = document.createElement('div');
  sw.className = 'fb-mode-switch';

  var selectBtn = document.createElement('button');
  selectBtn.className = 'fb-mode-btn';
  selectBtn.dataset.mode = 'select';
  selectBtn.title = 'Curseur — sélection (V)';
  selectBtn.innerHTML = ICON_CURSOR;
  selectBtn.addEventListener('click', function () { setMode('select'); });
  sw.appendChild(selectBtn);

  var dragBtn = document.createElement('button');
  dragBtn.className = 'fb-mode-btn';
  dragBtn.dataset.mode = 'drag';
  dragBtn.title = 'Déplacement — pan (H)';
  dragBtn.innerHTML = ICON_HAND;
  dragBtn.addEventListener('click', function () { setMode('drag'); });
  sw.appendChild(dragBtn);

  return sw;
}

// -- Keyboard: V = select, H = drag, Esc = clear selection --
// Scoped to when the pointer is over the board, so an embedded FlowBoard
// never steals plain keystrokes from the rest of the host page.
