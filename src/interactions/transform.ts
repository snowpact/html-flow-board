import { DOT_COLOR, DOT_RADIUS, DOT_SPACING, ZOOM_MAX, ZOOM_MIN } from '../core/constants';
import { state } from '../core/state';
import { saveZoom } from '../core/storage';
import { Screen } from '../core/types';

export function setZoom(z: number): void {
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

export function applyTransform(): void {
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
export function fitToContent(): void {
  if (!state.wrapperEl || !state.project) return;

  var screens = state.project.screens || [];
  var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  var hasVisible = false;

  screens.forEach(function (s: Screen) {
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
