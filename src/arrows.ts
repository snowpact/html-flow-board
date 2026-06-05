import { ARROW_BLEND, ARROW_OFFSET } from './core/constants';
import { getPrimarySide } from './core/geometry';
import { state } from './core/state';
import { showArrowPopup } from './render/popups';
import { Arrow, Position, Side } from './core/types';

interface SidePair {
  from: Side;
  to: Side;
}

interface AnchorPoint extends Position {
  name: string;
}

export function getBestSides(fromEl: HTMLElement, toEl: HTMLElement): SidePair {
  var fromId = fromEl.dataset.screenId;
  var toId = toEl.dataset.screenId;
  var fp = state.positions[fromId];
  var tp = state.positions[toId];
  var fw = fromEl.offsetWidth;
  var fh = fromEl.offsetHeight;
  var tw = toEl.offsetWidth;
  var th = toEl.offsetHeight;

  var fcx = fp.x + fw / 2;
  var fcy = fp.y + fh / 2;
  var tcx = tp.x + tw / 2;
  var tcy = tp.y + th / 2;

  var dx = tcx - fcx;
  var dy = tcy - fcy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' };
  } else {
    return dy > 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' };
  }
}

export function getAnchor(screenId: string, side: Side): Position {
  var el = state.screenEls[screenId];
  if (!el) return { x: 0, y: 0 };

  var pos = state.positions[screenId];
  var w = el.offsetWidth;
  var h = el.offsetHeight;

  // Parse side into primary direction + fraction
  var parts = side ? side.split('-') : [];
  var primary, fraction;

  if (parts.length === 1) {
    primary = parts[0];
    fraction = 0.5;
  } else if (parts[0] === 'left' || parts[0] === 'right') {
    // Left/right: 5 sub-positions along height
    primary = parts[0];
    var lrMap: Record<string, number> = { top: 1/6, upper: 2/6, middle: 0.5, lower: 4/6, bottom: 5/6 };
    fraction = lrMap[parts[1]] !== undefined ? lrMap[parts[1]] : 0.5;
  } else {
    // Top/bottom: 3 sub-positions along width
    primary = parts[0];
    var tbMap: Record<string, number> = { left: 0.25, right: 0.75 };
    fraction = tbMap[parts[1]] !== undefined ? tbMap[parts[1]] : 0.5;
  }

  switch (primary) {
    case 'left':   return { x: pos.x,     y: pos.y + h * fraction };
    case 'right':  return { x: pos.x + w, y: pos.y + h * fraction };
    case 'top':    return { x: pos.x + w * fraction, y: pos.y };
    case 'bottom': return { x: pos.x + w * fraction, y: pos.y + h };
    default:       return { x: pos.x + w / 2, y: pos.y + h / 2 };
  }
}

export function computeControlPoints(start: Position, end: Position, fromSide: Side, toSide: Side): { cp1: Position; cp2: Position } {
  var fromPrimary = getPrimarySide(fromSide);
  var toPrimary = getPrimarySide(toSide);
  var dx = end.x - start.x;
  var dy = end.y - start.y;

  var cp1 = { x: start.x, y: start.y };
  var cp2 = { x: end.x, y: end.y };

  switch (fromPrimary) {
    case 'right':  cp1.x += ARROW_OFFSET; cp1.y += dy * ARROW_BLEND; break;
    case 'left':   cp1.x -= ARROW_OFFSET; cp1.y += dy * ARROW_BLEND; break;
    case 'bottom': cp1.y += ARROW_OFFSET; cp1.x += dx * ARROW_BLEND; break;
    case 'top':    cp1.y -= ARROW_OFFSET; cp1.x += dx * ARROW_BLEND; break;
  }
  switch (toPrimary) {
    case 'right':  cp2.x += ARROW_OFFSET; cp2.y -= dy * ARROW_BLEND; break;
    case 'left':   cp2.x -= ARROW_OFFSET; cp2.y -= dy * ARROW_BLEND; break;
    case 'bottom': cp2.y += ARROW_OFFSET; cp2.x -= dx * ARROW_BLEND; break;
    case 'top':    cp2.y -= ARROW_OFFSET; cp2.x -= dx * ARROW_BLEND; break;
  }

  return { cp1: cp1, cp2: cp2 };
}

// Resolve the sides for a given arrow: arrow props → auto-spread → auto-detect.
export function resolveArrowSides(arrow: Arrow, idx: number, spreadMap: Record<number, SidePair>): SidePair {
  if (arrow.fromSide && arrow.toSide) {
    return { from: arrow.fromSide, to: arrow.toSide };
  }
  if (spreadMap && spreadMap[idx] !== undefined) {
    return spreadMap[idx];
  }
  var fromEl = state.screenEls[arrow.from];
  var toEl = state.screenEls[arrow.to];
  if (fromEl && toEl) {
    return getBestSides(fromEl, toEl);
  }
  return { from: 'right', to: 'left' };
}

export function getAllAnchorPoints(screenId: string): AnchorPoint[] {
  var names = [
    'left-top', 'left-upper', 'left-middle', 'left-lower', 'left-bottom',
    'right-top', 'right-upper', 'right-middle', 'right-lower', 'right-bottom',
    'top-left', 'top', 'top-right',
    'bottom-left', 'bottom', 'bottom-right'
  ];
  var points: AnchorPoint[] = [];
  for (var i = 0; i < names.length; i++) {
    var pt = getAnchor(screenId, names[i]);
    points.push({ name: names[i], x: pt.x, y: pt.y });
  }
  return points;
}

// Build auto-spread map (index-based): when multiple arrows connect the
// same pair of screens and don't have explicit fromSide/toSide, distribute
// them across sub-positions so they don't overlap visually.
export function buildSpreadMap(): Record<number, SidePair> {
  var arrows: Arrow[] = state.project ? (state.project.arrows || []) : [];

  // First pass: group ALL visible arrows by screen pair
  var pairGroups: Record<string, number[]> = {};
  arrows.forEach(function (arrow: Arrow, idx: number) {
    if (state.hiddenScreens[arrow.from] || state.hiddenScreens[arrow.to]) return;

    var ids = [arrow.from, arrow.to].sort();
    var pairKey = ids[0] + '|' + ids[1];
    if (!pairGroups[pairKey]) pairGroups[pairKey] = [];
    pairGroups[pairKey].push(idx);
  });

  // Second pass: assign spread positions to arrows without explicit sides
  var spreadMap: Record<number, SidePair> = {};

  Object.keys(pairGroups).forEach(function (pairKey: string) {
    var group = pairGroups[pairKey];
    if (group.length <= 1) return;

    group.forEach(function (arrowIdx: number, posInGroup: number) {
      var arrow = arrows[arrowIdx];
      // Skip arrows that already have explicit sides
      if (arrow.fromSide && arrow.toSide) return;

      var fromEl = state.screenEls[arrow.from];
      var toEl = state.screenEls[arrow.to];
      if (!fromEl || !toEl) return;

      var baseSides = getBestSides(fromEl, toEl);
      var isHorizontal = (baseSides.from === 'right' || baseSides.from === 'left');

      var suffixes: string[];
      if (group.length === 2) {
        suffixes = isHorizontal ? ['-upper', '-lower'] : ['-left', '-right'];
      } else if (group.length === 3) {
        suffixes = isHorizontal ? ['-upper', '-middle', '-lower'] : ['-left', '', '-right'];
      } else if (group.length === 4) {
        suffixes = isHorizontal
          ? ['-top', '-upper', '-lower', '-bottom']
          : ['-left', '', '-right'];
      } else {
        suffixes = isHorizontal
          ? ['-top', '-upper', '-middle', '-lower', '-bottom']
          : ['-left', '', '-right'];
      }

      var suffix = suffixes[Math.min(posInGroup, suffixes.length - 1)];
      spreadMap[arrowIdx] = {
        from: baseSides.from + suffix,
        to: baseSides.to + suffix
      };
    });
  });

  return spreadMap;
}

// Freeze spread-computed sides onto arrow objects so they never shift
// when arrows are added/removed later. Called once at init and on reset.
export function freezeArrowSides(): void {
  var arrows: Arrow[] = state.project ? (state.project.arrows || []) : [];
  var spreadMap = buildSpreadMap();
  arrows.forEach(function (arrow: Arrow, idx: number) {
    if (arrow.fromSide && arrow.toSide) return;
    var sides = resolveArrowSides(arrow, idx, spreadMap);
    arrow.fromSide = sides.from;
    arrow.toSide = sides.to;
  });
}

export function drawArrows(skipHandles?: boolean): void {
  if (!state.svgEl || !state.project) return;

  var arrows: Arrow[] = state.project.arrows || [];
  var ns = 'http://www.w3.org/2000/svg';
  var spreadMap = buildSpreadMap();
  state.svgEl.innerHTML = '';

  // Arrow marker — equilateral shape, fixed size, auto-orient follows curve angle
  var defs = document.createElementNS(ns, 'defs');
  var marker = document.createElementNS(ns, 'marker');
  marker.setAttribute('id', 'fb-arrowhead');
  marker.setAttribute('markerUnits', 'userSpaceOnUse');
  marker.setAttribute('markerWidth', '14');
  marker.setAttribute('markerHeight', '14');
  marker.setAttribute('refX', '14');
  marker.setAttribute('refY', '7');
  marker.setAttribute('orient', 'auto');
  var polygon = document.createElementNS(ns, 'polygon');
  polygon.setAttribute('points', '0 0, 14 7, 0 14');
  polygon.setAttribute('fill', '#888');
  marker.appendChild(polygon);
  defs.appendChild(marker);
  state.svgEl.appendChild(defs);

  arrows.forEach(function (arrow: Arrow, idx: number) {
    var fromEl = state.screenEls[arrow.from];
    var toEl = state.screenEls[arrow.to];
    if (!fromEl || !toEl) return;

    var sides = resolveArrowSides(arrow, idx, spreadMap);

    var start = getAnchor(arrow.from, sides.from);
    var end = getAnchor(arrow.to, sides.to);

    var cps = computeControlPoints(start, end, sides.from, sides.to);
    var cp1 = cps.cp1;
    var cp2 = cps.cp2;

    var d = 'M' + start.x + ',' + start.y +
            ' C' + cp1.x + ',' + cp1.y +
            ' ' + cp2.x + ',' + cp2.y +
            ' ' + end.x + ',' + end.y;

    // Check if either endpoint screen is individually hidden
    var isDimmed = state.hiddenScreens[arrow.from] || state.hiddenScreens[arrow.to];

    // Group for arrow path
    var g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'fb-arrow-group' + (isDimmed ? ' fb-arrow-dimmed' : ''));

    // Main visible path
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'fb-arrow-path' + (arrow.dashed ? ' fb-dashed' : ''));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#888');
    path.setAttribute('stroke-width', '2');
    if (arrow.dashed) {
      path.setAttribute('stroke-dasharray', '6 4');
    }
    path.setAttribute('marker-end', 'url(#fb-arrowhead)');
    g.appendChild(path);

    // Wider invisible hit area for hover + click
    var hitPath = document.createElementNS(ns, 'path');
    hitPath.setAttribute('d', d);
    hitPath.setAttribute('class', 'fb-arrow-hit');
    hitPath.setAttribute('fill', 'none');
    hitPath.setAttribute('stroke', 'transparent');
    hitPath.setAttribute('stroke-width', '16');
    hitPath.setAttribute('pointer-events', 'stroke');
    (hitPath as SVGElement).style.cursor = 'pointer';
    (function (arrowIdx: number) {
      hitPath.addEventListener('click', function (e: MouseEvent) {
        e.stopPropagation();
        showArrowPopup(e, arrowIdx);
      });
    })(idx);
    g.appendChild(hitPath);

    state.svgEl.appendChild(g);

    // Label
    if (arrow.label) {
      var midX = (start.x + end.x + cp1.x + cp2.x) / 4;
      var midY = (start.y + end.y + cp1.y + cp2.y) / 4;

      var labelGroup = document.createElementNS(ns, 'g');
      if (isDimmed) labelGroup.setAttribute('class', 'fb-arrow-dimmed');

      var text = document.createElementNS(ns, 'text');
      text.setAttribute('x', String(midX));
      text.setAttribute('y', String(midY));
      text.setAttribute('class', 'fb-arrow-label');
      text.setAttribute('fill', '#555');
      text.setAttribute('font-size', '11');
      text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.textContent = arrow.label;

      // Temporarily add text to measure
      state.svgEl.appendChild(text);
      var bbox;
      try { bbox = (text as SVGTextElement).getBBox(); } catch (e) { bbox = { x: midX - 20, y: midY - 8, width: 40, height: 16 }; }
      state.svgEl.removeChild(text);

      var bgRect = document.createElementNS(ns, 'rect');
      bgRect.setAttribute('x', String(bbox.x - 4));
      bgRect.setAttribute('y', String(bbox.y - 2));
      bgRect.setAttribute('width', String(bbox.width + 8));
      bgRect.setAttribute('height', String(bbox.height + 4));
      bgRect.setAttribute('class', 'fb-arrow-label-bg');
      bgRect.setAttribute('fill', '#f0f2f5');
      bgRect.setAttribute('rx', '3');
      bgRect.setAttribute('ry', '3');

      labelGroup.appendChild(bgRect);
      labelGroup.appendChild(text);
      state.svgEl.appendChild(labelGroup);
    }
  });

  if (!skipHandles) {
    updateHandles();
  }
}

export function updateHandles(): void {
  // Remove old handle divs
  state.handleEls.forEach(function (el: HTMLElement) { if (el.parentNode) el.parentNode.removeChild(el); });
  state.handleEls = [];

  if (!state.project) return;

  var arrows: Arrow[] = state.project.arrows || [];
  var spreadMap = buildSpreadMap();

  arrows.forEach(function (arrow: Arrow, idx: number) {
    var fromEl = state.screenEls[arrow.from];
    var toEl = state.screenEls[arrow.to];
    if (!fromEl || !toEl) return;

    // Skip handles for arrows connected to a dimmed screen
    if (state.hiddenScreens[arrow.from] || state.hiddenScreens[arrow.to]) return;

    var sides = resolveArrowSides(arrow, idx, spreadMap);

    var start = getAnchor(arrow.from, sides.from);
    var end = getAnchor(arrow.to, sides.to);

    [
      { pt: start, end: 'from', screenId: arrow.from },
      { pt: end,   end: 'to',   screenId: arrow.to }
    ].forEach(function (cfg: { pt: Position; end: string; screenId: string }) {
      var h = document.createElement('div');
      h.className = 'fb-arrow-handle';
      h.style.left = (cfg.pt.x - 8) + 'px';
      h.style.top = (cfg.pt.y - 8) + 'px';
      h.dataset.arrowIndex = String(idx);
      h.dataset.arrowEnd = cfg.end;
      h.dataset.screenId = cfg.screenId;

      state.canvasEl.appendChild(h);
      state.handleEls.push(h);
    });
  });
}


// -- Arrow contextual popup --

