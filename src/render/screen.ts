import { PresetId, Screen, Position } from '../core/types';
import { drawArrows } from '../arrows';
import { escapeHtml } from '../core/geometry';
import { getEpic, screenHeight, screenWidth, state } from '../core/state';
import { saveHiddenScreens } from '../core/storage';
import { cancelHideAnchors, scheduleHideAnchors, showAnchorDots } from './anchors';
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

  // Size — explicit width; height stays content-driven unless resized.
  el.style.width = screenWidth(screenData) + 'px';
  var h = screenHeight(screenData);
  if (h) el.style.height = h + 'px';

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
  toggleBtn.title = 'Masquer cet écran';
  toggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
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

  // Resize handle (bottom-right corner)
  var resizeHandle = document.createElement('div');
  resizeHandle.className = 'fb-resize-handle';
  el.appendChild(resizeHandle);

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
}

