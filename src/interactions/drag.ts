// @ts-nocheck
import { drawArrows } from '../arrows';
import { CANVAS_H, CANVAS_W } from '../core/constants';
import { toggleSelection } from '../core/geometry';
import { state } from '../core/state';
import { savePositions } from '../core/storage';
import { hideAnchorDots, showAnchorDots } from '../render/anchors';
import { closeArrowPopup, closeScreenPopup } from '../render/popups';

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
