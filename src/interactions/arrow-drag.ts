import { buildSpreadMap, drawArrows, getAllAnchorPoints, getBestSides, updateHandles } from '../arrows';
import { state } from '../core/state';
import { saveArrowMutations } from '../core/storage';
import { closeArrowPopup, closeScreenPopup } from '../render/popups';
import { Arrow } from '../core/types';

export function initArrowDrag(): void {
  // Mousedown: event delegation on canvas for .fb-arrow-handle
  state.canvasEl.addEventListener('mousedown', function (e: MouseEvent) {
    if (state.creatingArrow) return;
    var handle = (e.target as HTMLElement).closest('.fb-arrow-handle') as HTMLElement;
    if (!handle) return;

    closeArrowPopup();
    closeScreenPopup();
    e.stopPropagation();
    e.preventDefault();

    var arrowIdx = parseInt(handle.dataset.arrowIndex, 10);
    var arrow: Arrow = state.project.arrows[arrowIdx];
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
  document.addEventListener('mousemove', function (e: MouseEvent) {
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
    var arrow: Arrow = state.project.arrows[state.draggingHandle.arrowIdx];
    var prop = state.draggingHandle.end === 'from' ? 'fromSide' : 'toSide';
    arrow[prop] = bestAnchor.name;

    // Redraw SVG only (skip handles — we're moving one manually)
    drawArrows(true);
  });

  // Mouseup: finish drag
  document.addEventListener('mouseup', function (): void {
    if (!state.draggingHandle) return;

    saveArrowMutations();
    updateHandles();
    state.draggingHandle = null;
    state.wrapperEl.classList.remove('fb-dragging-handle');
  });
}

// -- Arrows --
