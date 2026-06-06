import { drawArrows, freezeArrowSides } from './arrows';
import { CANVAS_H, CANVAS_W } from './core/constants';
import { recomputeHiddenEpics, state } from './core/state';
import { FlowConfig, Screen } from './core/types';
import { loadArrowMutations, loadDoc, loadHiddenScreens, loadPositions, loadZoom, savePositions, storageKey } from './core/storage';
import { parse } from './flowml/parse';
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

  // Flow-ML is the source of truth for screens/arrows, so Reset only restores the
  // default auto-layout + visibility; it does not revert content typed in the panel.
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
  if (state.commit) state.commit(); // persist the reset layout into the Flow-ML doc
}

// -- Export full init config as JS --
export function init(config: FlowConfig): void {
  if (!config || !config.project) {
    console.error('FlowBoard.init: config.project is required');
    return;
  }

  state.project = config.project; // set first so storageKey()/loadDoc resolve the right key
  // Pin the storage key to the name the embedding page passed, so editing `!name`
  // in the panel never writes to (or orphans) a different key.
  state.storageKeyBase = 'fb-' + (config.project.name || 'default');

  // Flow-ML in localStorage is the source of truth: if present (and the caller did
  // NOT pass an explicit config.state), it supersedes the passed config — an
  // intentionally-empty doc (0 screens, no parse errors) is honored too.
  var savedDoc = loadDoc();
  if (savedDoc && !config.state) {
    var parsedDoc = parse(savedDoc);
    if (parsedDoc.project.screens.length || parsedDoc.errors.length === 0) {
      var docHidden: Record<string, boolean> = {};
      parsedDoc.project.screens.forEach(function (s) { if (s.hidden) docHidden[s.id] = true; });
      config = {
        container: config.container,
        project: parsedDoc.project,
        state: { positions: parsedDoc.positions, hiddenScreens: docHidden, arrows: parsedDoc.project.arrows },
      };
      state.project = config.project;
    }
  }

  state.showNotes = true;
  state.hiddenScreens = {};
  state.hiddenEpics = {};
  state.arrowPopup = null;
  state.creatingArrow = null;
  state.anchorDotsEls = [];
  state.layoutIndex = 0;

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
  recomputeHiddenEpics();

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
    // Merge over auto-layout so screens absent from the saved map keep a sensible
    // slot instead of stacking at {100,100}.
    screens.forEach(function (s) {
      if (configState.positions[s.id]) state.positions[s.id] = configState.positions[s.id];
    });
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

    // First-load migration: once the legacy deltas have been folded into the
    // Flow-ML doc (just written by commit), drop the orphaned legacy keys.
    if (!savedDoc) {
      try {
        var mk = storageKey();
        localStorage.removeItem(mk + '-pos');
        localStorage.removeItem(mk + '-hidden');
        localStorage.removeItem(mk + '-arrowmods');
      } catch (e) { /* ignore */ }
    }
  });
}

// -- Expose API --
