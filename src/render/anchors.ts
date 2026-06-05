// @ts-nocheck
import { computeControlPoints, drawArrows, getAllAnchorPoints, getAnchor } from '../arrows';
import { state } from '../core/state';
import { saveArrowMutations } from '../core/storage';

export var hoverHideTimeout = null;

export function scheduleHideAnchors() {
  if (state.creatingArrow) return;
  hoverHideTimeout = setTimeout(function () {
    hideAnchorDots();
    hoverHideTimeout = null;
  }, 150);
}

export function cancelHideAnchors() {
  if (hoverHideTimeout) {
    clearTimeout(hoverHideTimeout);
    hoverHideTimeout = null;
  }
}

export function showAnchorDots(screenId) {
  hideAnchorDots();
  if (state.hiddenScreens[screenId]) return;

  var anchors = getAllAnchorPoints(screenId);
  anchors.forEach(function (anchor) {
    var dot = document.createElement('div');
    dot.className = 'fb-anchor-dot';
    dot.style.left = (anchor.x - 6) + 'px';
    dot.style.top = (anchor.y - 6) + 'px';
    dot.dataset.screenId = screenId;
    dot.dataset.anchorName = anchor.name;

    dot.addEventListener('mouseenter', function () {
      cancelHideAnchors();
      dot.classList.add('fb-anchor-dot-hover');
    });
    dot.addEventListener('mouseleave', function () {
      dot.classList.remove('fb-anchor-dot-hover');
      scheduleHideAnchors();
    });
    dot.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      e.preventDefault();
      startArrowCreation(screenId, anchor.name);
    });

    state.canvasEl.appendChild(dot);
    state.anchorDotsEls.push(dot);
  });
}

export function hideAnchorDots() {
  state.anchorDotsEls.forEach(function (el) {
    if (el.parentNode) el.parentNode.removeChild(el);
  });
  state.anchorDotsEls = [];
}

export function showAllAnchorDots() {
  hideAnchorDots();
  var screens = state.project.screens || [];
  screens.forEach(function (s) {
    if (state.hiddenScreens[s.id]) return;
    var anchors = getAllAnchorPoints(s.id);
    anchors.forEach(function (anchor) {
      var dot = document.createElement('div');
      dot.className = 'fb-anchor-dot';
      dot.style.left = (anchor.x - 6) + 'px';
      dot.style.top = (anchor.y - 6) + 'px';
      dot.dataset.screenId = s.id;
      dot.dataset.anchorName = anchor.name;

      dot.addEventListener('mouseenter', function () {
        dot.classList.add('fb-anchor-dot-hover');
      });
      dot.addEventListener('mouseleave', function () {
        dot.classList.remove('fb-anchor-dot-hover');
      });
      dot.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        e.preventDefault();
        if (state.creatingArrow && s.id !== state.creatingArrow.fromScreenId) {
          completeArrowCreation(s.id, anchor.name);
        }
      });

      state.canvasEl.appendChild(dot);
      state.anchorDotsEls.push(dot);
    });
  });

  // Highlight source dot
  if (state.creatingArrow) {
    state.anchorDotsEls.forEach(function (dot) {
      if (dot.dataset.screenId === state.creatingArrow.fromScreenId &&
          dot.dataset.anchorName === state.creatingArrow.fromSide) {
        dot.classList.add('fb-anchor-dot-source');
      }
    });
  }
}

export function startArrowCreation(fromScreenId, fromSide) {
  state.creatingArrow = {
    fromScreenId: fromScreenId,
    fromSide: fromSide,
    tempLine: null
  };

  showAllAnchorDots();

  // Create temporary SVG path
  var ns = 'http://www.w3.org/2000/svg';

  // Add temp arrowhead marker if not present
  var defs = state.svgEl.querySelector('defs');
  if (defs && !state.svgEl.querySelector('#fb-arrowhead-temp')) {
    var marker = document.createElementNS(ns, 'marker');
    marker.setAttribute('id', 'fb-arrowhead-temp');
    marker.setAttribute('markerUnits', 'userSpaceOnUse');
    marker.setAttribute('markerWidth', '14');
    marker.setAttribute('markerHeight', '14');
    marker.setAttribute('refX', '14');
    marker.setAttribute('refY', '7');
    marker.setAttribute('orient', 'auto');
    var polygon = document.createElementNS(ns, 'polygon');
    polygon.setAttribute('points', '0 0, 14 7, 0 14');
    polygon.setAttribute('fill', '#2A9D8F');
    marker.appendChild(polygon);
    defs.appendChild(marker);
  }

  var tempPath = document.createElementNS(ns, 'path');
  tempPath.setAttribute('class', 'fb-arrow-temp');
  tempPath.setAttribute('fill', 'none');
  tempPath.setAttribute('stroke', '#2A9D8F');
  tempPath.setAttribute('stroke-width', '2');
  tempPath.setAttribute('stroke-dasharray', '8 4');
  tempPath.setAttribute('marker-end', 'url(#fb-arrowhead-temp)');
  state.svgEl.appendChild(tempPath);
  state.creatingArrow.tempLine = tempPath;

  state.wrapperEl.classList.add('fb-creating-arrow');

  document.addEventListener('mousemove', handleArrowCreationMove);
  document.addEventListener('keydown', handleArrowCreationKeydown);
  state.wrapperEl.addEventListener('mousedown', handleArrowCreationCancel);
}

export function handleArrowCreationMove(e) {
  if (!state.creatingArrow || !state.creatingArrow.tempLine) return;

  var wrapperRect = state.wrapperEl.getBoundingClientRect();
  var canvasX = (e.clientX - wrapperRect.left - state.panX) / state.zoom;
  var canvasY = (e.clientY - wrapperRect.top - state.panY) / state.zoom;

  var start = getAnchor(state.creatingArrow.fromScreenId, state.creatingArrow.fromSide);

  var dx = canvasX - start.x;
  var dy = canvasY - start.y;
  var toSide;
  if (Math.abs(dx) >= Math.abs(dy)) {
    toSide = dx > 0 ? 'left' : 'right';
  } else {
    toSide = dy > 0 ? 'top' : 'bottom';
  }

  var cps = computeControlPoints(start, { x: canvasX, y: canvasY }, state.creatingArrow.fromSide, toSide);

  var d = 'M' + start.x + ',' + start.y +
          ' C' + cps.cp1.x + ',' + cps.cp1.y +
          ' ' + cps.cp2.x + ',' + cps.cp2.y +
          ' ' + canvasX + ',' + canvasY;

  state.creatingArrow.tempLine.setAttribute('d', d);
}

export function handleArrowCreationKeydown(e) {
  if (e.key === 'Escape') {
    cancelArrowCreation();
  }
}

export function handleArrowCreationCancel(e) {
  if (e.target.classList.contains('fb-anchor-dot')) return;
  if (e.target.closest('.fb-screen')) return;
  cancelArrowCreation();
}

export function cancelArrowCreation() {
  if (!state.creatingArrow) return;

  if (state.creatingArrow.tempLine && state.creatingArrow.tempLine.parentNode) {
    state.creatingArrow.tempLine.parentNode.removeChild(state.creatingArrow.tempLine);
  }

  var tempMarker = state.svgEl.querySelector('#fb-arrowhead-temp');
  if (tempMarker && tempMarker.parentNode) {
    tempMarker.parentNode.removeChild(tempMarker);
  }

  state.creatingArrow = null;
  state.wrapperEl.classList.remove('fb-creating-arrow');
  hideAnchorDots();

  document.removeEventListener('mousemove', handleArrowCreationMove);
  document.removeEventListener('keydown', handleArrowCreationKeydown);
  state.wrapperEl.removeEventListener('mousedown', handleArrowCreationCancel);
}

export function completeArrowCreation(toScreenId, toSide) {
  if (!state.creatingArrow) return;

  var fromScreenId = state.creatingArrow.fromScreenId;
  var fromSide = state.creatingArrow.fromSide;

  if (fromScreenId === toScreenId) {
    cancelArrowCreation();
    return;
  }

  var newArrow = { from: fromScreenId, to: toScreenId, fromSide: fromSide, toSide: toSide };
  state.project.arrows.push(newArrow);
  saveArrowMutations();

  cancelArrowCreation();
  drawArrows();
}

// -- Export PNG (html2canvas, lazy-loaded) --

