// @ts-nocheck
import { SELECT_DRAG_THRESHOLD } from '../core/constants';
import { rectsIntersect } from '../core/geometry';
import { state } from '../core/state';
import { updateSelectionStyles } from './drag';
import { closeArrowPopup, closeScreenPopup } from '../render/popups';

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
