import { drawArrows, freezeArrowSides } from './arrows';
import { CANVAS_H, CANVAS_W } from './core/constants';
import { state } from './core/state';
import { Epic, FlowConfig, Screen } from './core/types';
import { loadArrowMutations, loadHiddenScreens, loadPositions, loadZoom, savePositions, storageKey } from './core/storage';
import { initArrowDrag } from './interactions/arrow-drag';
import { initCreateMenu } from './interactions/create';
import { initDrag } from './interactions/drag';
import { initSync } from './interactions/sync';
import { renderPanel } from './render/panel';
import { initModeKeys, setMode } from './interactions/mode';
import { initPan } from './interactions/pan';
import { initSelection } from './interactions/selection';
import { applyTransform, fitToContent } from './interactions/transform';
import { LAYOUT_STRATEGIES, autoLayout } from './layout';
import { renderModeSwitch } from './render/mode-switch';
import { renderScreen } from './render/screen';
import { renderToolbar, updateLayoutButton } from './render/toolbar';

export function cycleLayout(): void {
  state.layoutIndex = (state.layoutIndex + 1) % LAYOUT_STRATEGIES.length;

  var heights: Record<string, number> = {};
  var screens = state.project.screens || [];
  var arrows = state.project.arrows || [];
  screens.forEach(function (s: Screen) {
    var el = state.screenEls[s.id];
    if (el) heights[s.id] = el.offsetHeight;
  });

  var layoutFn = LAYOUT_STRATEGIES[state.layoutIndex].fn;
  state.positions = layoutFn(screens, arrows, heights);

  screens.forEach(function (s: Screen) {
    var el = state.screenEls[s.id];
    var pos = state.positions[s.id];
    if (el && pos) {
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
    }
  });

  updateLayoutButton();
  savePositions();
  drawArrows();
  fitToContent();
}

export function doReset(): void {
  if (!confirm('Remettre la disposition par défaut ?')) return;

  var key = storageKey();
  try {
    localStorage.removeItem(key + '-pos');
    localStorage.removeItem(key + '-zoom');
    localStorage.removeItem(key + '-arrows');  // legacy cleanup
    localStorage.removeItem(key + '-hidden');
    localStorage.removeItem(key + '-arrowmods');
  } catch (e) { /* ignore */ }

  // Restore original arrows from init config
  if (state._originalArrows) {
    state.project.arrows = JSON.parse(JSON.stringify(state._originalArrows));
  }

  state.hiddenScreens = {};
  state.hiddenEpics = {};
  state.selected = {};
  state.layoutIndex = 0;

  var screens = state.project.screens || [];
  var arrows = state.project.arrows || [];
  var heights: Record<string, number> = {};
  screens.forEach(function (s: Screen) {
    var el = state.screenEls[s.id];
    if (el) heights[s.id] = el.offsetHeight;
  });
  state.positions = autoLayout(screens, arrows, heights);
  state.defaultPositions = JSON.parse(JSON.stringify(state.positions));

  screens.forEach(function (s: Screen) {
    var el = state.screenEls[s.id];
    var pos = state.positions[s.id];
    if (el && pos) {
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
      el.classList.remove('fb-screen-dimmed', 'fb-selected');
    }
  });

  var checkboxes = state.container.querySelectorAll('.fb-legend-checkbox');
  for (var i = 0; i < checkboxes.length; i++) {
    (checkboxes[i] as HTMLInputElement).checked = true;
    var item = checkboxes[i].closest('.fb-legend-item');
    if (item) item.classList.remove('fb-dimmed');
  }

  updateLayoutButton();
  drawArrows();
  freezeArrowSides();
  fitToContent();
}

// -- Export full init config as JS --
export function init(config: FlowConfig): void {
  if (!config || !config.project) {
    console.error('FlowBoard.init: config.project is required');
    return;
  }

  state.project = config.project;
  state.showNotes = true;
  state.hiddenScreens = {};
  state.hiddenEpics = {};
  state.arrowPopup = null;
  state.creatingArrow = null;
  state.anchorDotsEls = [];
  state.layoutIndex = 0;

  // Keep original arrows for reset
  state._originalArrows = JSON.parse(JSON.stringify(state.project.arrows || []));

  // config.state takes priority over everything
  var configState = config.state || null;

  // Load arrow mutations from localStorage (or config.state)
  if (configState && configState.arrows) {
    state.project.arrows = JSON.parse(JSON.stringify(configState.arrows));
  } else {
    var savedArrowMods = loadArrowMutations();
    if (savedArrowMods) state.project.arrows = savedArrowMods;
  }

  // Load hidden screens early (before toolbar, so legend checkboxes are correct)
  if (configState && configState.hiddenScreens) {
    state.hiddenScreens = JSON.parse(JSON.stringify(configState.hiddenScreens));
  } else {
    var savedHidden = loadHiddenScreens();
    if (savedHidden) {
      state.hiddenScreens = savedHidden;
    }
  }

  // Derive hiddenEpics from hiddenScreens: an epic is "hidden" if all its screens are hidden
  var allScreens = config.project.screens || [];
  (config.project.epics || []).forEach(function (epic: Epic) {
    var epicScreens = allScreens.filter(function (s: Screen) { return s.epic === epic.id; });
    if (epicScreens.length > 0 && epicScreens.every(function (s: Screen) { return state.hiddenScreens[s.id]; })) {
      state.hiddenEpics[epic.id] = true;
    }
  });

  // Resolve container
  var containerEl: HTMLElement;
  if (typeof config.container === 'string') {
    containerEl = document.querySelector(config.container) as HTMLElement;
  } else if (config.container instanceof HTMLElement) {
    containerEl = config.container;
  }
  if (!containerEl) {
    console.error('FlowBoard.init: container not found');
    return;
  }

  // Build root
  var root = document.createElement('div');
  root.className = 'fb-container';
  containerEl.innerHTML = '';
  containerEl.appendChild(root);
  state.container = root;

  // Toolbar
  root.appendChild(renderToolbar());

  // Canvas wrapper
  var wrapper = document.createElement('div');
  wrapper.className = 'fb-canvas-wrapper';

  var sizer = document.createElement('div');
  sizer.className = 'fb-canvas-sizer';

  var canvas = document.createElement('div');
  canvas.className = 'fb-canvas';
  canvas.style.width = CANVAS_W + 'px';
  canvas.style.height = CANVAS_H + 'px';

  // SVG arrows layer
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'fb-arrows-layer');
  svg.setAttribute('width', String(CANVAS_W));
  svg.setAttribute('height', String(CANVAS_H));

  canvas.appendChild(svg);
  sizer.appendChild(canvas);
  wrapper.appendChild(sizer);
  wrapper.appendChild(renderModeSwitch());

  // Body row: Flow-ML panel | canvas
  var body = document.createElement('div');
  body.className = 'fb-body';
  body.appendChild(renderPanel());
  body.appendChild(wrapper);
  root.appendChild(body);

  state.wrapperEl = wrapper;
  state.sizerEl = sizer;
  state.canvasEl = canvas;
  state.svgEl = svg;
  state.screenEls = {};

  // Auto-layout (first pass with estimated heights)
  var screens = state.project.screens || [];
  var arrows = state.project.arrows || [];
  state.defaultPositions = autoLayout(screens, arrows);
  state.positions = JSON.parse(JSON.stringify(state.defaultPositions));

  // Load saved positions (override auto-layout)
  var hasSavedPositions = false;
  if (configState && configState.positions) {
    hasSavedPositions = true;
    state.positions = JSON.parse(JSON.stringify(configState.positions));
  } else {
    var savedPos = loadPositions();
    if (savedPos) {
      hasSavedPositions = true;
      screens.forEach(function (s) {
        if (savedPos[s.id]) state.positions[s.id] = savedPos[s.id];
      });
    }
  }

  // Load saved zoom/pan
  var hasSavedZoom = false;
  if (configState && configState.zoom !== undefined) {
    hasSavedZoom = true;
    state.zoom = configState.zoom;
    state.panX = configState.panX || 0;
    state.panY = configState.panY || 0;
  } else {
    var savedZoom = loadZoom();
    if (savedZoom) {
      hasSavedZoom = true;
      state.zoom = savedZoom.zoom || 1;
      state.panX = savedZoom.panX || 0;
      state.panY = savedZoom.panY || 0;
    }
  }

  // Update zoom label if saved zoom was loaded
  if (hasSavedZoom) {
    var zl = document.getElementById('fb-zoom-label');
    if (zl) zl.textContent = Math.round(state.zoom * 100) + '%';
  }

  // Render screens
  screens.forEach(function (s) {
    var el = renderScreen(s);
    canvas.appendChild(el);
  });

  // Apply transform
  applyTransform();

  // Init interactions
  initPan();
  initDrag();
  initArrowDrag();
  initSelection();
  initModeKeys();
  initCreateMenu();
  setMode('drag'); // default mode (sets wrapper class + active button)
  initSync(); // Flow-ML panel ↔ diagram (fills the panel from the current board)

  // After DOM layout: measure heights, recompute layout, draw arrows
  requestAnimationFrame(function () {
    // Measure actual screen heights
    var heights: Record<string, number> = {};
    screens.forEach(function (s: Screen) {
      var el = state.screenEls[s.id];
      if (el) heights[s.id] = el.offsetHeight;
    });

    // Recompute layout with measured heights
    state.defaultPositions = autoLayout(screens, arrows, heights);

    if (!hasSavedPositions) {
      state.positions = JSON.parse(JSON.stringify(state.defaultPositions));
      // Apply corrected positions to DOM
      screens.forEach(function (s: Screen) {
        var el = state.screenEls[s.id];
        var pos = state.positions[s.id];
        if (el && pos) {
          el.style.left = pos.x + 'px';
          el.style.top = pos.y + 'px';
        }
      });
    }

    if (!hasSavedZoom) {
      fitToContent();
    }

    drawArrows();
    freezeArrowSides();
    if (state.commit) state.commit(); // refresh the panel with the settled positions
  });
}

// -- Expose API --
