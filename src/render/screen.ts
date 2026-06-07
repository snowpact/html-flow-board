import { Format, PresetId, Screen, Position } from '../core/types';
import { drawArrows } from '../arrows';
import { FORMATS } from '../core/constants';
import { escapeHtml } from '../core/geometry';
import { getEpic, screenHeight, screenWidth, state } from '../core/state';
import { saveHiddenScreens } from '../core/storage';
import { cancelHideAnchors, scheduleHideAnchors, showAnchorDots } from './anchors';
import { ICON_EYE } from './icons';
import { showScreenPopup } from './popups';
import { isCustomPreset, skeletonHtml } from './presets';

export function toggleScreen(screenId: string): void {
  if (state.hiddenScreens[screenId]) {
    delete state.hiddenScreens[screenId];
  } else {
    state.hiddenScreens[screenId] = true;
  }
  applyScreenVisibility(screenId);
  saveHiddenScreens();
  drawArrows();
}

export function applyScreenVisibility(screenId: string): void {
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
export function renderScreen(screenData: Screen): HTMLElement {
  var epic = getEpic(screenData.epic);
  var color = epic ? epic.color : '#666';

  var el = document.createElement('div');
  el.className = 'fb-screen';
  el.dataset.screenId = screenData.id;

  // Size — a format sets only a MIN so the card grows with its content; legacy
  // explicit width/height stays fixed.
  if (screenData.format && FORMATS[screenData.format]) {
    var ff = FORMATS[screenData.format];
    el.style.minWidth = ff.width + 'px';
    el.style.minHeight = ff.height + 'px';
  } else {
    el.style.width = screenWidth(screenData) + 'px';
    var h = screenHeight(screenData);
    if (h) el.style.height = h + 'px';
  }

  // Position
  var pos: Position = state.positions[screenData.id] || { x: 100, y: 100 };
  el.style.left = pos.x + 'px';
  el.style.top = pos.y + 'px';

  // Header
  var hdr = document.createElement('div');
  hdr.className = 'fb-screen-header';
  hdr.style.background = color;
  hdr.innerHTML = '<span>' + escapeHtml(screenData.title) + '</span>';

  var toggleBtn = document.createElement('button');
  toggleBtn.className = 'fb-screen-toggle';
  toggleBtn.title = 'Hide this screen';
  toggleBtn.innerHTML = ICON_EYE;
  toggleBtn.addEventListener('click', function(e: MouseEvent) {
    e.stopPropagation();
    toggleScreen(screenData.id);
  });
  hdr.appendChild(toggleBtn);

  el.appendChild(hdr);

  // Body — see applyScreenBody.
  var body = document.createElement('div');
  applyScreenBody(body, screenData);
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
  el.addEventListener('contextmenu', function (e: MouseEvent) {
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

// Render a screen's body for its preset. 'custom' (or absent) renders the raw
// `content` HTML; other presets render a grey skeleton (content kept in data).
export function applyScreenBody(body: HTMLElement, screenData: Screen): void {
  body.className = 'fb-screen-body';
  body.innerHTML = '';
  var preset: PresetId = screenData.preset || 'custom';
  if (isCustomPreset(preset)) {
    body.innerHTML = screenData.content || '';
  } else {
    body.classList.add('fb-skeleton', 'fb-skel-' + preset);
    body.innerHTML = skeletonHtml(preset);
  }
}

// Change a screen's device format (proportions). Resets any free-resize so the
// new format's base dimensions apply.
export function setScreenFormat(screenId: string, format: Format): void {
  var screens: Screen[] = (state.project && state.project.screens) || [];
  var screen: Screen = null;
  for (var i = 0; i < screens.length; i++) {
    if (screens[i].id === screenId) { screen = screens[i]; break; }
  }
  if (!screen) return;
  screen.format = format;
  var el = state.screenEls[screenId];
  if (el) {
    el.style.width = ''; el.style.height = ''; el.style.minWidth = ''; el.style.minHeight = '';
    if (FORMATS[format]) {
      var ff = FORMATS[format];
      el.style.minWidth = ff.width + 'px';
      el.style.minHeight = ff.height + 'px';
    } else {
      el.style.width = screenWidth(screen) + 'px';
      var h = screenHeight(screen);
      if (h) el.style.height = h + 'px';
    }
  }
  drawArrows();
  if (state.commit) state.commit();
}

// Delete a screen: remove it, the arrows touching it, its DOM node, and its
// bookkeeping; then redraw + re-serialize.
export function deleteScreen(screenId: string): void {
  var screens: Screen[] = (state.project && state.project.screens) || [];
  var idx = -1;
  for (var i = 0; i < screens.length; i++) { if (screens[i].id === screenId) { idx = i; break; } }
  if (idx === -1) return;
  screens.splice(idx, 1);

  var arrows = (state.project && state.project.arrows) || [];
  state.project.arrows = arrows.filter(function (a) { return a.from !== screenId && a.to !== screenId; });

  var el = state.screenEls[screenId];
  if (el && el.parentNode) el.parentNode.removeChild(el);
  delete state.screenEls[screenId];
  delete state.hiddenScreens[screenId];
  delete state.selected[screenId];
  if (state.positions) delete state.positions[screenId];

  drawArrows();
  if (state.commit) state.commit();
}

// Assign a screen to an epic (or null to clear); recolor its header + re-serialize.
export function setScreenEpic(screenId: string, epicId: string | null): void {
  var screens: Screen[] = (state.project && state.project.screens) || [];
  var screen: Screen = null;
  for (var i = 0; i < screens.length; i++) {
    if (screens[i].id === screenId) { screen = screens[i]; break; }
  }
  if (!screen) return;
  if (epicId) screen.epic = epicId; else delete screen.epic;
  var el = state.screenEls[screenId];
  if (el) {
    var epic = getEpic(screen.epic);
    var hdr = el.querySelector('.fb-screen-header') as HTMLElement;
    if (hdr) hdr.style.background = epic ? epic.color : '#666';
  }
  if (state.commit) state.commit();
}

// Change a screen's preset and re-render its body in place.
export function setScreenPreset(screenId: string, preset: PresetId): void {
  var screens: Screen[] = (state.project && state.project.screens) || [];
  var screen: Screen = null;
  for (var i = 0; i < screens.length; i++) {
    if (screens[i].id === screenId) { screen = screens[i]; break; }
  }
  if (!screen) return;
  screen.preset = preset;
  var el = state.screenEls[screenId];
  if (!el) return;
  var body = el.querySelector('.fb-screen-body') as HTMLElement;
  if (body) applyScreenBody(body, screen);
  drawArrows();
  if (state.commit) state.commit();
}

