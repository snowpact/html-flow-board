import { CANVAS_H, CANVAS_W, GAP_X, GAP_Y } from './core/constants';
import { screenWidth, state } from './core/state';
import { Arrow, Position, Screen } from './core/types';
import { labelMetrics } from './arrows';

export function bfsDepth(screens: Screen[], arrows: Arrow[]): Record<string, number> {
  var children: Record<string, string[]> = {};
  var hasParent: Record<string, boolean> = {};
  screens.forEach(function (s) { children[s.id] = []; });
  arrows.forEach(function (a) {
    if (children[a.from]) children[a.from].push(a.to);
    hasParent[a.to] = true;
  });
  var roots = screens.filter(function (s) { return !hasParent[s.id]; }).map(function (s) { return s.id; });
  if (roots.length === 0 && screens.length > 0) roots = [screens[0].id];

  var col: Record<string, number> = {};
  var visited: Record<string, boolean> = {};
  var queue: string[] = [];
  roots.forEach(function (r) { queue.push(r); col[r] = 0; visited[r] = true; });
  while (queue.length > 0) {
    var cur = queue.shift();
    (children[cur] || []).forEach(function (child) {
      if (!visited[child]) {
        visited[child] = true;
        col[child] = (col[cur] || 0) + 1;
        queue.push(child);
      }
    });
  }
  screens.forEach(function (s) { if (col[s.id] === undefined) col[s.id] = 0; });
  return col;
}

export function centerPositions(positions: Record<string, Position>, screens: Screen[], totalW: number, totalH: number): void {
  var cx = Math.max(0, Math.round((CANVAS_W - totalW) / 2));
  var cy = Math.max(0, Math.round((CANVAS_H - totalH) / 2));
  screens.forEach(function (s) {
    if (positions[s.id]) {
      positions[s.id].x += cx;
      positions[s.id].y += cy;
    }
  });
}

// Arrows that shape the layout: the journey (main + default arrows). 'nav' arrows
// (menus, back links) would otherwise drag every screen into one crowded column.
export function layoutArrows(arrows: Arrow[]): Arrow[] {
  var core = arrows.filter(function (a) { return a.kind !== 'nav'; });
  return core.length ? core : arrows;
}

// Reorder screens inside each column by the barycenter of their neighbours in the
// adjacent column (a few down/up sweeps). Cheap Sugiyama-style pass that removes
// most arrow crossings. Stable: ties keep the input order.
export function orderColumns(columns: Record<string, Screen[]>, colKeys: number[], arrows: Arrow[], col: Record<string, number>): void {
  var nb: Record<string, string[]> = {};
  arrows.forEach(function (a) {
    if (a.from === a.to) return;
    (nb[a.from] = nb[a.from] || []).push(a.to);
    (nb[a.to] = nb[a.to] || []).push(a.from);
  });
  var rank: Record<string, number> = {};
  function reindex(c: number): void {
    var list = columns[c];
    list.forEach(function (s, i) { rank[s.id] = (i + 0.5) / list.length; });
  }
  colKeys.forEach(reindex);

  function sweep(keys: number[], dir: number): void {
    keys.forEach(function (c) {
      var list = columns[c];
      var bary: Record<string, number> = {};
      list.forEach(function (s) {
        var ns = (nb[s.id] || []).filter(function (n) { return col[n] === c + dir; });
        if (!ns.length) { bary[s.id] = rank[s.id]; return; }
        var sum = 0;
        ns.forEach(function (n) { sum += rank[n]; });
        bary[s.id] = sum / ns.length;
      });
      var idx: Record<string, number> = {};
      list.forEach(function (s, i) { idx[s.id] = i; });
      list.sort(function (a, b) { return (bary[a.id] - bary[b.id]) || (idx[a.id] - idx[b.id]); });
      reindex(c);
    });
  }

  var down = colKeys.slice(1);
  var up = colKeys.slice(0, -1).reverse();
  for (var it = 0; it < 4; it++) { sweep(down, -1); sweep(up, +1); }
}

// Max screens stacked in one column before it is split (Flow layout).
export var MAX_PER_COLUMN = 6;
// Max screens in one row before it wraps (Epics rows).
export var MAX_PER_ROW = 8;

// Room an arrow's label needs between its two screens: the label box plus a
// margin on each side, so the box never touches a screen. 0 when no label.
var LABEL_MARGIN = 36;
export function arrowRoom(a: Arrow): { w: number; h: number } {
  var m = labelMetrics(a);
  if (!m) return { w: 0, h: 0 };
  return { w: m.w + LABEL_MARGIN * 2, h: m.h + LABEL_MARGIN * 2 };
}

// Gap to leave between two groups of screens (column i → i+1, or row i → i+1):
// the default, or the widest label of any arrow crossing between them.
function gapBetween(fromIds: Record<string, boolean>, toIds: Record<string, boolean>, arrows: Arrow[], axis: 'w' | 'h', base: number): number {
  var gap = base;
  arrows.forEach(function (a) {
    var crosses = (fromIds[a.from] && toIds[a.to]) || (fromIds[a.to] && toIds[a.from]);
    if (!crosses) return;
    var room = arrowRoom(a)[axis];
    if (room > gap) gap = room;
  });
  return gap;
}

function idSet(list: Screen[]): Record<string, boolean> {
  var out: Record<string, boolean> = {};
  list.forEach(function (s) { out[s.id] = true; });
  return out;
}

// -- Auto layout (Flow) --
export function autoLayout(screens: Screen[], arrows: Arrow[], heights?: Record<string, number>): Record<string, Position> {
  var core = layoutArrows(arrows);
  var col = bfsDepth(screens, core);

  // Group by column
  var columns: Record<string, Screen[]> = {};
  screens.forEach(function (s) {
    var c = col[s.id];
    if (!columns[c]) columns[c] = [];
    columns[c].push(s);
  });
  var colKeys = Object.keys(columns).map(Number).sort(function (a, b) { return a - b; });
  orderColumns(columns, colKeys, core, col);

  // A crowded depth becomes several side-by-side sub-columns (≤ MAX_PER_COLUMN
  // each) so the board keeps a readable aspect ratio instead of a tall strip.
  var split: Screen[][] = [];
  colKeys.forEach(function (c) {
    var list = columns[c];
    var parts = Math.ceil(list.length / MAX_PER_COLUMN);
    var per = Math.ceil(list.length / parts);
    for (var i = 0; i < list.length; i += per) split.push(list.slice(i, i + per));
  });
  columns = {};
  colKeys = split.map(function (_l, i) { return i; });
  split.forEach(function (l, i) { columns[i] = l; });

  function h(s: Screen): number { return (heights && heights[s.id]) ? heights[s.id] : 200; }

  // Column heights first, so each column can be centered on the tallest one.
  var colH: Record<number, number> = {};
  var totalH = 0;
  colKeys.forEach(function (c) {
    var sum = 0;
    columns[c].forEach(function (s) { sum += h(s) + GAP_Y; });
    colH[c] = sum - GAP_Y;
    if (colH[c] > totalH) totalH = colH[c];
  });

  var positions: Record<string, Position> = {};
  var offsetX = 0;
  var lastGap = 0;
  colKeys.forEach(function (c, ci) {
    var colScreens = columns[c];
    var maxW = 0;
    colScreens.forEach(function (s) {
      var w = screenWidth(s);
      if (w > maxW) maxW = w;
    });

    var offsetY = Math.round((totalH - colH[c]) / 2);
    colScreens.forEach(function (s) {
      positions[s.id] = { x: offsetX, y: offsetY };
      offsetY += h(s) + GAP_Y;
    });
    var next = colKeys[ci + 1];
    lastGap = next === undefined ? 0 : gapBetween(idSet(colScreens), idSet(columns[next]), arrows, 'w', GAP_X);
    offsetX += maxW + lastGap;
  });
  var totalW = offsetX;

  centerPositions(positions, screens, totalW, totalH);
  return positions;
}

// -- Layout by Epics: one row (swimlane) per epic, screens left → right in
// journey order (BFS depth), wrapping after MAX_PER_ROW. --
export function layoutByEpics(screens: Screen[], arrows: Arrow[], heights?: Record<string, number>): Record<string, Position> {
  var epicGroups: Record<string, Screen[]> = {};
  var epicOrder: string[] = [];
  screens.forEach(function (s) {
    var eid = s.epic || '_none';
    if (!epicGroups[eid]) { epicGroups[eid] = []; epicOrder.push(eid); }
    epicGroups[eid].push(s);
  });

  var col = bfsDepth(screens, layoutArrows(arrows));
  var rows: Screen[][] = [];
  epicOrder.forEach(function (eid) {
    var group = epicGroups[eid].slice();
    var idx: Record<string, number> = {};
    group.forEach(function (s, i) { idx[s.id] = i; });
    group.sort(function (a, b) { return ((col[a.id] || 0) - (col[b.id] || 0)) || (idx[a.id] - idx[b.id]); });
    for (var i = 0; i < group.length; i += MAX_PER_ROW) rows.push(group.slice(i, i + MAX_PER_ROW));
  });

  var positions: Record<string, Position> = {};
  var offsetY = 0;
  var totalW = 0;
  rows.forEach(function (row, ri) {
    var offsetX = 0;
    var rowH = 0;
    row.forEach(function (s, si) {
      positions[s.id] = { x: offsetX, y: offsetY };
      var one: Record<string, boolean> = {}; one[s.id] = true;
      var nxt = row[si + 1];
      var g = nxt ? gapBetween(one, (function () { var o: Record<string, boolean> = {}; o[nxt.id] = true; return o; })(), arrows, 'w', GAP_X) : 0;
      offsetX += screenWidth(s) + g;
      var hh = (heights && heights[s.id]) ? heights[s.id] : 200;
      if (hh > rowH) rowH = hh;
    });
    if (offsetX > totalW) totalW = offsetX;
    var nextRow = rows[ri + 1];
    var vg = nextRow ? gapBetween(idSet(row), idSet(nextRow), arrows, 'h', GAP_Y * 2) : 0;
    offsetY += rowH + vg;
  });

  centerPositions(positions, screens, totalW, offsetY);
  return positions;
}

// -- Layout Grid --
export function layoutGrid(screens: Screen[], arrows: Arrow[], heights: Record<string, number>): Record<string, Position> {
  var cols = Math.max(1, Math.round(Math.sqrt(screens.length)));
  var positions: Record<string, Position> = {};
  var offsetX = 0, offsetY = 0;
  var rowMaxH = 0;
  var totalW = 0, totalH = 0;

  screens.forEach(function (s, i) {
    var colIdx = i % cols;
    if (colIdx === 0 && i > 0) {
      offsetY += rowMaxH + GAP_Y;
      offsetX = 0;
      rowMaxH = 0;
    }
    positions[s.id] = { x: offsetX, y: offsetY };
    var w = screenWidth(s);
    var h = (heights && heights[s.id]) ? heights[s.id] : 200;
    if (h > rowMaxH) rowMaxH = h;
    offsetX += w + GAP_X;
    if (offsetX > totalW) totalW = offsetX;
  });
  totalH = offsetY + rowMaxH;

  centerPositions(positions, screens, totalW - GAP_X, totalH);
  return positions;
}

// -- Layout strategies --
export var LAYOUT_STRATEGIES: { name: string; fn: (screens: Screen[], arrows: Arrow[], heights: Record<string, number>) => Record<string, Position>; available?: () => boolean }[] = [
  { name: 'Flow', fn: autoLayout },
  { name: 'Epics', fn: layoutByEpics },
  { name: 'Grid', fn: layoutGrid }
];

// -- Cycle layout --
