// @ts-nocheck
import { hideAnchorDots, showAnchorDots } from './anchors';
import { buildSpreadMap, drawArrows, getAllAnchorPoints, getBestSides, updateHandles } from './arrows';
import { CANVAS_H, CANVAS_W, DOT_COLOR, DOT_RADIUS, DOT_SPACING, SELECT_DRAG_THRESHOLD, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './constants';
import { rectsIntersect, toggleSelection } from './geometry';
import { closeArrowPopup, closeScreenPopup } from './popups';
import { state } from './state';
import { saveArrowMutations, savePositions, saveZoom } from './storage';

export function setZoom(z) {
  var newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));
  // Zoom toward center of viewport
  if (state.wrapperEl) {
    var wrapperRect = state.wrapperEl.getBoundingClientRect();
    var mx = wrapperRect.width / 2;
    var my = wrapperRect.height / 2;
    var cx = (mx - state.panX) / state.zoom;
    var cy = (my - state.panY) / state.zoom;
    state.panX = mx - cx * newZoom;
    state.panY = my - cy * newZoom;
  }
  state.zoom = newZoom;
  applyTransform();
  var label = document.getElementById('fb-zoom-label');
  if (label) label.textContent = Math.round(state.zoom * 100) + '%';
  saveZoom();
}

export function applyTransform() {
  if (state.sizerEl) {
    state.sizerEl.style.transform = 'translate(' + state.panX + 'px,' + state.panY + 'px) scale(' + state.zoom + ')';
  }
  // Counter-scale the dotted grid against the canvas's zoom so the dots keep
  // a constant on-screen size. They still pan for free (the grid rides the
  // canvas transform). Only rewritten when zoom actually changes.
  if (state.canvasEl && state._dotZoom !== state.zoom) {
    state._dotZoom = state.zoom;
    var sp = DOT_SPACING / state.zoom;
    var r = DOT_RADIUS / state.zoom;
    state.canvasEl.style.backgroundSize = sp + 'px ' + sp + 'px';
    state.canvasEl.style.backgroundImage =
      'radial-gradient(circle, ' + DOT_COLOR + ' ' + r + 'px, transparent ' + r + 'px)';
  }
}

// -- Fit to content --
export function fitToContent() {
  if (!state.wrapperEl || !state.project) return;

  var screens = state.project.screens || [];
  var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  var hasVisible = false;

  screens.forEach(function (s) {
    if (state.hiddenScreens[s.id]) return;
    var el = state.screenEls[s.id];
    var pos = state.positions[s.id];
    if (!el || !pos) return;
    hasVisible = true;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + el.offsetWidth);
    maxY = Math.max(maxY, pos.y + el.offsetHeight);
  });

  if (!hasVisible) return;

  var wrapperRect = state.wrapperEl.getBoundingClientRect();
  var viewW = wrapperRect.width;
  var viewH = wrapperRect.height;

  var contentW = maxX - minX;
  var contentH = maxY - minY;

  var padding = 60;
  var zoomX = (viewW - padding * 2) / contentW;
  var zoomY = (viewH - padding * 2) / contentH;
  var zoom = Math.min(zoomX, zoomY, 1.0);
  zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(zoom * 100) / 100));

  var panX = (viewW - contentW * zoom) / 2 - minX * zoom;
  var panY = (viewH - contentH * zoom) / 2 - minY * zoom;

  state.zoom = zoom;
  state.panX = panX;
  state.panY = panY;
  applyTransform();

  var label = document.getElementById('fb-zoom-label');
  if (label) label.textContent = Math.round(state.zoom * 100) + '%';

  saveZoom();
}

// -- Axis-aligned rectangle overlap (selection hit-test) --
// Rects use {left, top, right, bottom} (matches getBoundingClientRect).
export function initPan() {
  var wrapper = state.wrapperEl;

  // Wheel: Ctrl/Meta = zoom toward cursor, otherwise = pan
  wrapper.addEventListener('wheel', function (e) {
    closeArrowPopup();
    closeScreenPopup();
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      var wrapperRect = wrapper.getBoundingClientRect();
      var mx = e.clientX - wrapperRect.left;
      var my = e.clientY - wrapperRect.top;
      // Canvas point under cursor
      var cx = (mx - state.panX) / state.zoom;
      var cy = (my - state.panY) / state.zoom;
      var delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      var newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((state.zoom + delta) * 100) / 100));
      // Adjust pan so the same canvas point stays under cursor
      state.panX = mx - cx * newZoom;
      state.panY = my - cy * newZoom;
      state.zoom = newZoom;
      applyTransform();
      var label = document.getElementById('fb-zoom-label');
      if (label) label.textContent = Math.round(state.zoom * 100) + '%';
      saveZoom();
    } else {
      e.preventDefault();
      state.panX -= e.deltaX;
      state.panY -= e.deltaY;
      applyTransform();
      saveZoom();
    }
  }, { passive: false });

  // Click-drag on background to pan (drag mode only)
  wrapper.addEventListener('mousedown', function (e) {
    if (state.mode !== 'drag') return;
    if (state.creatingArrow) return;
    if (e.target.closest('.fb-screen, .fb-arrow-handle, .fb-popup, .fb-mode-switch, .fb-toolbar, .fb-legend')) return;
    if (e.button !== 0) return;

    closeArrowPopup();
    closeScreenPopup();

    state.panDrag = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: state.panX,
      startPanY: state.panY
    };
    wrapper.classList.add('fb-panning');
    e.preventDefault();
  });

  document.addEventListener('mousemove', function (e) {
    if (!state.panDrag) return;
    state.panX = state.panDrag.startPanX + (e.clientX - state.panDrag.startX);
    state.panY = state.panDrag.startPanY + (e.clientY - state.panDrag.startY);
    applyTransform();
  });

  document.addEventListener('mouseup', function () {
    if (!state.panDrag) return;
    state.panDrag = null;
    wrapper.classList.remove('fb-panning');
    saveZoom();
  });
}

// -- Selection helpers --

// Reflect state.selected onto the DOM (.fb-selected class)
export function updateSelectionStyles() {
  for (var id in state.screenEls) {
    var el = state.screenEls[id];
    if (!el) continue;
    if (state.selected[id]) {
      el.classList.add('fb-selected');
    } else {
      el.classList.remove('fb-selected');
    }
  }
}

// Begin moving screens. In select mode with a selection, moves the whole
// group; otherwise moves just the screen under the cursor. Delta-based so
// single and group moves share one path.
export function startScreenDrag(e) {
  hideAnchorDots();
  var wrapperRect = state.wrapperEl.getBoundingClientRect();
  var startCanvas = {
    x: (e.clientX - wrapperRect.left - state.panX) / state.zoom,
    y: (e.clientY - wrapperRect.top - state.panY) / state.zoom
  };

  var ids;
  if (state.mode === 'select' && Object.keys(state.selected).length) {
    ids = Object.keys(state.selected);
  } else {
    var target = e.target.closest('.fb-screen');
    ids = target ? [target.dataset.screenId] : [];
  }

  var items = [];
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    if (state.hiddenScreens[id]) continue;
    var el = state.screenEls[id];
    if (!el) continue;
    var pos = state.positions[id] || { x: 0, y: 0 };
    el.classList.add('fb-dragging');
    items.push({ id: id, el: el, startX: pos.x, startY: pos.y });
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y > maxY) maxY = pos.y;
  }
  if (!items.length) return;

  state.screenDrag = {
    startCanvas: startCanvas,
    items: items,
    bounds: { minX: minX, minY: minY, maxX: maxX, maxY: maxY }
  };
  state.wrapperEl.classList.add('fb-dragging-screen');
}

// -- Drag screens (single in drag mode, group in select mode) --
export function initDrag() {
  state.canvasEl.addEventListener('mousedown', function (e) {
    closeArrowPopup();
    closeScreenPopup();
    if (state.creatingArrow) return;
    if (e.button !== 0) return;
    var screenEl = e.target.closest('.fb-screen');
    if (!screenEl) return;

    var id = screenEl.dataset.screenId;
    // Block interaction on dimmed/hidden screens
    if (state.hiddenScreens[id]) return;

    e.stopPropagation();
    e.preventDefault();

    // Selection bookkeeping (select mode only)
    if (state.mode === 'select') {
      if (e.metaKey || e.ctrlKey || e.shiftKey) {
        // Toggle membership; do not start a move
        toggleSelection(state.selected, id);
        updateSelectionStyles();
        return;
      }
      if (!state.selected[id]) {
        // Click an unselected screen: collapse selection to just this one
        state.selected = {};
        state.selected[id] = true;
        updateSelectionStyles();
      }
      // else: clicked a screen already in the group -> keep group, drag it all
    }

    startScreenDrag(e);
  });

  document.addEventListener('mousemove', function (e) {
    if (!state.screenDrag) return;

    var wrapperRect = state.wrapperEl.getBoundingClientRect();
    var cmx = (e.clientX - wrapperRect.left - state.panX) / state.zoom;
    var cmy = (e.clientY - wrapperRect.top - state.panY) / state.zoom;
    var dx = cmx - state.screenDrag.startCanvas.x;
    var dy = cmy - state.screenDrag.startCanvas.y;

    // Clamp the delta at the group level so the selection moves as a rigid
    // block — clamping each screen on its own would deform the group at edges.
    var b = state.screenDrag.bounds;
    dx = Math.max(-b.minX, Math.min(CANVAS_W - 50 - b.maxX, dx));
    dy = Math.max(-b.minY, Math.min(CANVAS_H - 50 - b.maxY, dy));

    var items = state.screenDrag.items;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var newX = it.startX + dx;
      var newY = it.startY + dy;
      it.el.style.left = newX + 'px';
      it.el.style.top = newY + 'px';
      state.positions[it.id] = { x: newX, y: newY };
    }

    drawArrows(!!state.draggingHandle);
  });

  document.addEventListener('mouseup', function (e) {
    if (!state.screenDrag) return;

    var items = state.screenDrag.items;
    for (var i = 0; i < items.length; i++) {
      items[i].el.classList.remove('fb-dragging');
    }
    var singleId = items.length === 1 ? items[0].id : null;
    state.screenDrag = null;
    state.wrapperEl.classList.remove('fb-dragging-screen');
    savePositions();

    // Re-show anchor dots if cursor is still over a single dragged card
    if (singleId) {
      var elUnder = document.elementFromPoint(e.clientX, e.clientY);
      var screenUnder = elUnder && elUnder.closest('.fb-screen');
      if (screenUnder && screenUnder.dataset.screenId === singleId) {
        showAnchorDots(singleId);
      }
    }
  });
}

// -- Selection: rubber-band + click-empty-to-clear (select mode only) --
export function initSelection() {
  var wrapper = state.wrapperEl;

  wrapper.addEventListener('mousedown', function (e) {
    if (state.mode !== 'select') return;
    if (state.creatingArrow) return;
    if (e.button !== 0) return;
    if (e.target.closest('.fb-screen, .fb-arrow-handle, .fb-popup, .fb-mode-switch, .fb-toolbar, .fb-legend')) return;

    closeArrowPopup();
    closeScreenPopup();

    var additive = e.metaKey || e.ctrlKey || e.shiftKey;
    var base = {};
    if (additive) {
      for (var k in state.selected) base[k] = true;
    }
    state.selectBox = { startX: e.clientX, startY: e.clientY, base: base, additive: additive, moved: false, el: null };
    e.preventDefault();
  });

  document.addEventListener('mousemove', function (e) {
    if (!state.selectBox) return;
    var sb = state.selectBox;
    if (!sb.moved &&
        Math.abs(e.clientX - sb.startX) < SELECT_DRAG_THRESHOLD &&
        Math.abs(e.clientY - sb.startY) < SELECT_DRAG_THRESHOLD) {
      return;
    }
    sb.moved = true;

    // Lazily create the rubber-band element (wrapper-relative, screen px)
    if (!sb.el) {
      sb.el = document.createElement('div');
      sb.el.className = 'fb-select-rect';
      state.wrapperEl.appendChild(sb.el);
    }
    var wrapperRect = state.wrapperEl.getBoundingClientRect();
    var left = Math.min(e.clientX, sb.startX);
    var top = Math.min(e.clientY, sb.startY);
    var right = Math.max(e.clientX, sb.startX);
    var bottom = Math.max(e.clientY, sb.startY);
    sb.el.style.left = (left - wrapperRect.left) + 'px';
    sb.el.style.top = (top - wrapperRect.top) + 'px';
    sb.el.style.width = (right - left) + 'px';
    sb.el.style.height = (bottom - top) + 'px';

    // Live hit-test: rubber-band vs each screen, both in viewport px
    // (so zoom/pan need no conversion).
    var box = { left: left, top: top, right: right, bottom: bottom };
    var next = {};
    for (var bk in sb.base) next[bk] = true;
    var screens = state.project.screens || [];
    for (var i = 0; i < screens.length; i++) {
      var id = screens[i].id;
      if (state.hiddenScreens[id]) continue;
      var el = state.screenEls[id];
      if (!el) continue;
      if (rectsIntersect(box, el.getBoundingClientRect())) next[id] = true;
    }
    state.selected = next;
    updateSelectionStyles();
  });

  document.addEventListener('mouseup', function () {
    if (!state.selectBox) return;
    var sb = state.selectBox;
    if (sb.el && sb.el.parentNode) sb.el.parentNode.removeChild(sb.el);
    if (!sb.moved && !sb.additive) {
      // Pure click on empty background clears the selection
      // (a modifier+click on empty space is a no-op, not a clear).
      state.selected = {};
      updateSelectionStyles();
    }
    state.selectBox = null;
  });
}

// -- Mode switch (cursor/select vs drag/pan) --
export function setMode(mode) {
  if (mode !== 'select') mode = 'drag';
  state.mode = mode;

  // Leaving select mode clears any selection
  if (mode === 'drag') {
    state.selected = {};
    updateSelectionStyles();
  }

  if (state.wrapperEl) {
    state.wrapperEl.classList.toggle('fb-mode-select', mode === 'select');
    state.wrapperEl.classList.toggle('fb-mode-drag', mode === 'drag');
  }
  var sw = state.container && state.container.querySelector('.fb-mode-switch');
  if (sw) {
    var btns = sw.querySelectorAll('.fb-mode-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.mode === mode);
    }
  }
}

export function initModeKeys() {
  state.wrapperEl.addEventListener('mouseenter', function () { state.pointerInBoard = true; });
  state.wrapperEl.addEventListener('mouseleave', function () { state.pointerInBoard = false; });

  document.addEventListener('keydown', function (e) {
    if (!state.pointerInBoard) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'v' || e.key === 'V') {
      setMode('select');
    } else if (e.key === 'h' || e.key === 'H') {
      setMode('drag');
    } else if (e.key === 'Escape' && state.mode === 'select') {
      state.selected = {};
      updateSelectionStyles();
    }
  });
}

// -- Arrow handle drag --
export function initArrowDrag() {
  // Mousedown: event delegation on canvas for .fb-arrow-handle
  state.canvasEl.addEventListener('mousedown', function (e) {
    if (state.creatingArrow) return;
    var handle = e.target.closest('.fb-arrow-handle');
    if (!handle) return;

    closeArrowPopup();
    closeScreenPopup();
    e.stopPropagation();
    e.preventDefault();

    var arrowIdx = parseInt(handle.dataset.arrowIndex, 10);
    var arrow = state.project.arrows[arrowIdx];
    var end = handle.dataset.arrowEnd;
    var screenId = handle.dataset.screenId;

    // Init fromSide/toSide on the arrow if not already set
    if (!arrow.fromSide || !arrow.toSide) {
      var spread = buildSpreadMap();
      if (spread[arrowIdx]) {
        arrow.fromSide = spread[arrowIdx].from;
        arrow.toSide = spread[arrowIdx].to;
      } else {
        var fe = state.screenEls[arrow.from];
        var te = state.screenEls[arrow.to];
        if (fe && te) {
          var auto = getBestSides(fe, te);
          arrow.fromSide = auto.from;
          arrow.toSide = auto.to;
        } else {
          arrow.fromSide = 'right';
          arrow.toSide = 'left';
        }
      }
    }

    state.draggingHandle = { arrowIdx: arrowIdx, end: end, el: handle, screenId: screenId };
    state.wrapperEl.classList.add('fb-dragging-handle');
  });

  // Mousemove: snap to nearest anchor point
  document.addEventListener('mousemove', function (e) {
    if (!state.draggingHandle) return;

    var wrapperRect = state.wrapperEl.getBoundingClientRect();
    var canvasX = (e.clientX - wrapperRect.left - state.panX) / state.zoom;
    var canvasY = (e.clientY - wrapperRect.top - state.panY) / state.zoom;

    var screenId = state.draggingHandle.screenId;
    var anchors = getAllAnchorPoints(screenId);

    // Find nearest anchor
    var bestDist = Infinity;
    var bestAnchor = anchors[0];
    for (var i = 0; i < anchors.length; i++) {
      var dx = anchors[i].x - canvasX;
      var dy = anchors[i].y - canvasY;
      var dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestAnchor = anchors[i];
      }
    }

    // Update handle position
    state.draggingHandle.el.style.left = (bestAnchor.x - 8) + 'px';
    state.draggingHandle.el.style.top = (bestAnchor.y - 8) + 'px';

    // Update side directly on the arrow object
    var arrow = state.project.arrows[state.draggingHandle.arrowIdx];
    var prop = state.draggingHandle.end === 'from' ? 'fromSide' : 'toSide';
    arrow[prop] = bestAnchor.name;

    // Redraw SVG only (skip handles — we're moving one manually)
    drawArrows(true);
  });

  // Mouseup: finish drag
  document.addEventListener('mouseup', function () {
    if (!state.draggingHandle) return;

    saveArrowMutations();
    updateHandles();
    state.draggingHandle = null;
    state.wrapperEl.classList.remove('fb-dragging-handle');
  });
}

// -- Arrows --
