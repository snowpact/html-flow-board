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
  // In a focus view screens are temporarily re-laid out: frozen sides would point
  // the wrong way, so pick the best sides from the focus positions.
  if (state.focus) {
    var fe = state.screenEls[arrow.from], te = state.screenEls[arrow.to];
    if (fe && te) return getBestSides(fe, te);
  }
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

// Visual weight per arrow kind. `undefined` keeps the classic look.
var KIND_STYLE: Record<string, { color: string; width: string; marker: string }> = {
  main: { color: '#374151', width: '3', marker: 'fb-arrowhead-main' },
  nav: { color: '#b8bfca', width: '1.4', marker: 'fb-arrowhead-nav' },
  default: { color: '#888', width: '2', marker: 'fb-arrowhead' },
};

// Draw order: nav under default under main, so the journey always stays on top.
var KIND_RANK: Record<string, number> = { nav: 0, default: 1, main: 2 };

// Is this arrow drawn at all? Hidden when an end is out of the current focus, or
// when it is a nav arrow and nav arrows are toggled off.
export function isArrowShown(arrow: Arrow): boolean {
  if (state.focus && (!state.focus.visible[arrow.from] || !state.focus.visible[arrow.to])) return false;
  if (arrow.kind === 'nav' && state.showNav === false) return false;
  return true;
}

// Label width without touching the DOM: getBBox() forces a synchronous layout per
// label (the #1 cost of a redraw while dragging). A detached canvas measures the
// same font instantly; results are cached per (font, text).
var LABEL_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
var measureCtx: CanvasRenderingContext2D | null | undefined;
var widthCache: Record<string, number> = {};

export function measureLabel(text: string, fontSize: number, bold: boolean): number {
  var key = fontSize + (bold ? 'b' : '') + '|' + text;
  var hit = widthCache[key];
  if (hit !== undefined) return hit;
  if (measureCtx === undefined) {
    try { measureCtx = document.createElement('canvas').getContext('2d'); } catch (e) { measureCtx = null; }
  }
  var w: number;
  if (measureCtx) {
    measureCtx.font = (bold ? '600 ' : '') + fontSize + 'px ' + LABEL_FONT_FAMILY;
    w = measureCtx.measureText(text).width;
  } else {
    w = text.length * fontSize * 0.56; // no canvas (e.g. jsdom): close estimate
  }
  widthCache[key] = w;
  return w;
}

function makeMarker(ns: string, id: string, size: number, color: string): Element {
  var marker = document.createElementNS(ns, 'marker');
  marker.setAttribute('id', id);
  marker.setAttribute('markerUnits', 'userSpaceOnUse');
  marker.setAttribute('markerWidth', String(size));
  marker.setAttribute('markerHeight', String(size));
  marker.setAttribute('refX', String(size));
  marker.setAttribute('refY', String(size / 2));
  marker.setAttribute('orient', 'auto');
  var polygon = document.createElementNS(ns, 'polygon');
  polygon.setAttribute('points', '0 0, ' + size + ' ' + (size / 2) + ', 0 ' + size);
  polygon.setAttribute('fill', color);
  marker.appendChild(polygon);
  return marker;
}

// -- Arrow labels: wrapped, on the curve, nudged along it to avoid overlaps --

interface LabelJob {
  g: Element; arrow: Arrow; kind: string; dimmed: boolean;
  start: Position; cp1: Position; cp2: Position; end: Position;
}
interface Box { x: number; y: number; w: number; h: number; }

var LABEL_MAX_W = 170;  // px before wrapping
var LABEL_MAX_LINES = 3;
var LABEL_TS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82]; // positions tried along the curve

export function bezierPoint(p0: Position, p1: Position, p2: Position, p3: Position, t: number): Position {
  var u = 1 - t;
  var a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

// Greedy word wrap to LABEL_MAX_W, at most LABEL_MAX_LINES (last one ellipsized).
export function wrapLabel(text: string, fontSize: number, bold: boolean): string[] {
  var words = String(text).split(/\s+/).filter(function (w) { return w !== ''; });
  var lines: string[] = [];
  var cur = '';
  for (var i = 0; i < words.length; i++) {
    var next = cur ? cur + ' ' + words[i] : words[i];
    if (cur && measureLabel(next, fontSize, bold) > LABEL_MAX_W) {
      lines.push(cur);
      cur = words[i];
      if (lines.length === LABEL_MAX_LINES) { cur = ''; break; }
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > LABEL_MAX_LINES || (i < words.length && lines.length === LABEL_MAX_LINES)) {
    lines = lines.slice(0, LABEL_MAX_LINES);
    lines[LABEL_MAX_LINES - 1] = lines[LABEL_MAX_LINES - 1].replace(/\s*\S*$/, '') + '…';
  }
  return lines.length ? lines : [String(text)];
}

function overlapArea(a: Box, b: Box): number {
  var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  var h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return (w > 0 && h > 0) ? w * h : 0;
}

// Rects of the screens currently on the board (label obstacles), measured once.
function screenBoxes(): Box[] {
  var out: Box[] = [];
  (state.project.screens || []).forEach(function (s) {
    if (state.focus && !state.focus.visible[s.id]) return;
    var el = state.screenEls[s.id];
    var p = state.positions[s.id];
    if (!el || !p) return;
    out.push({ x: p.x - 6, y: p.y - 6, w: el.offsetWidth + 12, h: el.offsetHeight + 12 });
  });
  return out;
}

var KIND_PRIORITY: Record<string, number> = { main: 0, default: 1, nav: 2 };

function placeLabels(ns: string, jobs: LabelJob[]): void {
  if (!jobs.length) return;
  var screens = screenBoxes();
  var placed: Box[] = [];
  jobs.sort(function (a, b) { return KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]; });

  jobs.forEach(function (job) {
    var kind = job.kind;
    var bold = kind === 'main';
    var fontSize = kind === 'nav' ? 10 : 11;
    var lineH = Math.round(fontSize * 1.3);
    var lines = wrapLabel(job.arrow.label, fontSize, bold);
    var w = 0;
    lines.forEach(function (l) { w = Math.max(w, measureLabel(l, fontSize, bold)); });
    var bw = w + 10, bh = lines.length * lineH + 6;

    // Try spots along the curve; keep the first free one, else the least covered.
    var best: Position = null, bestScore = Infinity;
    for (var k = 0; k < LABEL_TS.length; k++) {
      var pt = bezierPoint(job.start, job.cp1, job.cp2, job.end, LABEL_TS[k]);
      var box = { x: pt.x - bw / 2, y: pt.y - bh / 2, w: bw, h: bh };
      var score = 0;
      for (var si = 0; si < screens.length; si++) score += overlapArea(box, screens[si]) * 3;
      for (var li = 0; li < placed.length; li++) score += overlapArea(box, placed[li]);
      if (score < bestScore) { bestScore = score; best = pt; }
      if (score === 0) break;
    }
    // Nav labels only show on hover: they never reserve room from the others.
    if (kind !== 'nav') placed.push({ x: best.x - bw / 2, y: best.y - bh / 2, w: bw, h: bh });

    var labelGroup = document.createElementNS(ns, 'g');
    labelGroup.setAttribute('class', 'fb-arrow-label-group' + (job.dimmed ? ' fb-arrow-dimmed' : ''));

    var bgRect = document.createElementNS(ns, 'rect');
    bgRect.setAttribute('x', String(best.x - bw / 2));
    bgRect.setAttribute('y', String(best.y - bh / 2));
    bgRect.setAttribute('width', String(bw));
    bgRect.setAttribute('height', String(bh));
    bgRect.setAttribute('class', 'fb-arrow-label-bg');
    bgRect.setAttribute('fill', kind === 'main' ? '#ffffff' : '#f0f2f5');
    if (kind === 'main') { bgRect.setAttribute('stroke', '#374151'); bgRect.setAttribute('stroke-width', '1'); }
    bgRect.setAttribute('rx', '4');
    bgRect.setAttribute('ry', '4');

    var text = document.createElementNS(ns, 'text');
    text.setAttribute('class', 'fb-arrow-label');
    text.setAttribute('fill', kind === 'main' ? '#1f2937' : '#555');
    text.setAttribute('font-size', String(fontSize));
    if (bold) text.setAttribute('font-weight', '600');
    text.setAttribute('font-family', LABEL_FONT_FAMILY);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('x', String(best.x));
    var y0 = best.y - ((lines.length - 1) * lineH) / 2;
    if (lines.length === 1) {
      text.setAttribute('y', String(best.y));
      text.textContent = lines[0];
    } else {
      text.setAttribute('y', String(y0));
      lines.forEach(function (l, idx) {
        var ts = document.createElementNS(ns, 'tspan');
        ts.setAttribute('x', String(best.x));
        ts.setAttribute('y', String(y0 + idx * lineH));
        ts.textContent = l;
        text.appendChild(ts);
      });
    }

    labelGroup.appendChild(bgRect);
    labelGroup.appendChild(text);
    job.g.appendChild(labelGroup);
  });
}

export function drawArrows(skipHandles?: boolean): void {
  if (!state.svgEl || !state.project) return;

  var arrows: Arrow[] = state.project.arrows || [];
  var ns = 'http://www.w3.org/2000/svg';
  var spreadMap = buildSpreadMap();
  state.svgEl.innerHTML = '';

  // Arrow markers — equilateral shape, fixed size, auto-orient follows curve angle
  var defs = document.createElementNS(ns, 'defs');
  defs.appendChild(makeMarker(ns, 'fb-arrowhead', 14, KIND_STYLE.default.color));
  defs.appendChild(makeMarker(ns, 'fb-arrowhead-main', 16, KIND_STYLE.main.color));
  defs.appendChild(makeMarker(ns, 'fb-arrowhead-nav', 10, KIND_STYLE.nav.color));
  state.svgEl.appendChild(defs);

  // screenId → its arrow groups, so hover emphasis only touches those.
  var byScreen: Record<string, Element[]> = {};
  state.arrowGroupsByScreen = byScreen;
  hlGroups = [];

  var labelJobs: LabelJob[] = [];

  var order = arrows.map(function (_a: Arrow, i: number) { return i; });
  order.sort(function (a: number, b: number) {
    return KIND_RANK[arrows[a].kind || 'default'] - KIND_RANK[arrows[b].kind || 'default'] || a - b;
  });

  order.forEach(function (idx: number) {
    var arrow = arrows[idx];
    var fromEl = state.screenEls[arrow.from];
    var toEl = state.screenEls[arrow.to];
    if (!fromEl || !toEl) return;
    if (!isArrowShown(arrow)) return;

    var kind = arrow.kind || 'default';
    var style = KIND_STYLE[kind];
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

    // Group for arrow path (+ its label, so hover styles can reach both)
    var g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'fb-arrow-group fb-arrow-' + kind + (isDimmed ? ' fb-arrow-dimmed' : ''));
    g.setAttribute('data-from', arrow.from);
    g.setAttribute('data-to', arrow.to);
    (byScreen[arrow.from] = byScreen[arrow.from] || []).push(g);
    if (arrow.to !== arrow.from) (byScreen[arrow.to] = byScreen[arrow.to] || []).push(g);

    // Main visible path
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'fb-arrow-path' + (arrow.dashed ? ' fb-dashed' : ''));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', style.color);
    path.setAttribute('stroke-width', style.width);
    if (arrow.dashed) {
      path.setAttribute('stroke-dasharray', '6 4');
    }
    path.setAttribute('marker-end', 'url(#' + style.marker + ')');
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

    // Label: placed after every path, by priority (see placeLabels)
    if (arrow.label) {
      labelJobs.push({ g: g, arrow: arrow, kind: kind, start: start, cp1: cp1, cp2: cp2, end: end, dimmed: !!isDimmed });
    }
  });

  placeLabels(ns, labelJobs);

  applyArrowHighlight();

  if (!skipHandles) {
    updateHandles();
  }
}

// -- Coalesced redraw: at most one drawArrows per animation frame (drag moves fire
// far more often than the screen refreshes). flushDrawArrows() forces it now.
var drawPending = false;
var pendingSkip = false;

export function scheduleDrawArrows(skipHandles?: boolean): void {
  pendingSkip = !!skipHandles;
  if (drawPending) return;
  drawPending = true;
  var raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : function (f: () => void) { return setTimeout(f, 16); };
  raf(function () {
    if (!drawPending) return;
    drawPending = false;
    drawArrows(pendingSkip);
  });
}

export function flushDrawArrows(): void {
  if (!drawPending) return;
  drawPending = false;
  drawArrows(pendingSkip);
}

// -- Hover emphasis: hovering a screen brings its arrows forward, fades the rest --

export function setHighlightedScreen(screenId: string | null): void {
  state.highlightScreen = screenId;
  applyArrowHighlight();
}

var hlGroups: Element[] = [];

// O(arrows of the hovered screen): the fade of every other arrow is one class on
// the SVG root (CSS), not a loop over all groups.
export function applyArrowHighlight(): void {
  if (!state.svgEl) return;
  var id = state.highlightScreen;
  for (var i = 0; i < hlGroups.length; i++) hlGroups[i].classList.remove('fb-arrow-hl');
  hlGroups = (id && state.arrowGroupsByScreen && state.arrowGroupsByScreen[id]) || [];
  for (var j = 0; j < hlGroups.length; j++) hlGroups[j].classList.add('fb-arrow-hl');
  state.svgEl.classList.toggle('fb-hl-active', !!id && hlGroups.length > 0);
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

    // Skip handles for arrows connected to a dimmed screen, or not drawn at all
    if (state.hiddenScreens[arrow.from] || state.hiddenScreens[arrow.to]) return;
    if (!isArrowShown(arrow)) return;

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

