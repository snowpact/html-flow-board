// @ts-nocheck
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../core/constants';
import { state } from '../core/state';
import { saveZoom } from '../core/storage';
import { applyTransform } from './transform';
import { closeArrowPopup, closeScreenPopup } from '../render/popups';

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
