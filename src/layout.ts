import { CANVAS_H, CANVAS_W, FORMATS, GAP_X, GAP_Y } from './core/constants';
import { screenWidth, state } from './core/state';
import { Arrow, Position, Screen } from './core/types';
import { labelMetrics } from './arrows';

// Every layout places screens on a TRUE grid (placeGrid): aligned columns and
// rows, top-left anchored (no per-column centering, which staggers screens),
// and gaps that leave room for the label cards drawn between neighbours.

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
// Max screens in one row before it wraps (Epics / Grid rows).
export var MAX_PER_ROW = 8;
// Vertical gap between two epic rows (swimlanes).
export var EPIC_ROW_GAP = GAP_Y * 2 + 40;

// Room an arrow's label needs between its two screens: the label box plus a
// margin on each side, so the box never touches a screen. 0 when no label.
var LABEL_MARGIN = 36;
export function arrowRoom(a: Arrow): { w: number; h: number } {
  var m = labelMetrics(a);
  if (!m) return { w: 0, h: 0 };
  return { w: m.w + LABEL_MARGIN * 2, h: m.h + LABEL_MARGIN * 2 };
}

// User spacing factor (toolbar − / +), applied to the base gaps of every layout.
export function spacingFactor(): number {
  var f = state.spacing;
  return (typeof f === 'number' && f > 0) ? f : 1;
}

// Measured height when known, else the format's minimum, else 200.
function heightOf(s: Screen, heights?: Record<string, number>): number {
  if (heights && heights[s.id]) return heights[s.id];
  if (s.height) return s.height;
  if (s.format && FORMATS[s.format]) return FORMATS[s.format].height;
  return 200;
}

// -- Core: place a matrix of cells on a true grid --
// cells[r][c] = screen or null. Column c is as wide as its widest screen, row r
// as tall as its tallest. The gap after column c (or row r) is the base gap or,
// if larger, the room needed by the biggest label of any arrow between a screen
// of that column (row) and one of the next.
export function placeGrid(cells: (Screen | null)[][], arrows: Arrow[], heights?: Record<string, number>, baseGapX?: number, baseGapY?: number): Record<string, Position> {
  var gx = (baseGapX === undefined ? GAP_X : baseGapX) * spacingFactor();
  var gy = (baseGapY === undefined ? GAP_Y : baseGapY) * spacingFactor();
  var nRows = cells.length;
  var nCols = 0;
  cells.forEach(function (r) { if (r.length > nCols) nCols = r.length; });

  var colW: number[] = [], rowH: number[] = [];
  var colOf: Record<string, number> = {}, rowOf: Record<string, number> = {};
  for (var c = 0; c < nCols; c++) colW[c] = 0;
  for (var r = 0; r < nRows; r++) {
    rowH[r] = 0;
    for (var c2 = 0; c2 < cells[r].length; c2++) {
      var s = cells[r][c2];
      if (!s) continue;
      colOf[s.id] = c2; rowOf[s.id] = r;
      colW[c2] = Math.max(colW[c2], screenWidth(s));
      rowH[r] = Math.max(rowH[r], heightOf(s, heights));
    }
  }

  // Gaps: widest / tallest label room among arrows that cross each boundary.
  var gapX: number[] = [], gapY: number[] = [];
  for (var i = 0; i < nCols; i++) gapX[i] = gx;
  for (var j = 0; j < nRows; j++) gapY[j] = gy;
  arrows.forEach(function (a) {
    if (colOf[a.from] === undefined || colOf[a.to] === undefined) return;
    var room = arrowRoom(a);
    if (!room.w) return;
    var c1 = colOf[a.from], c2 = colOf[a.to];
    if (Math.abs(c1 - c2) === 1) { var ci = Math.min(c1, c2); gapX[ci] = Math.max(gapX[ci], room.w); }
    var r1 = rowOf[a.from], r2 = rowOf[a.to];
    // Vertical room only for an arrow between two stacked screens; a diagonal
    // one already got its room from the column gap.
    if (c1 === c2 && Math.abs(r1 - r2) === 1) { var ri = Math.min(r1, r2); gapY[ri] = Math.max(gapY[ri], room.h); }
  });

  var colX: number[] = [], rowY: number[] = [];
  var x = 0;
  for (var c3 = 0; c3 < nCols; c3++) { colX[c3] = x; x += colW[c3] + gapX[c3]; }
  var y = 0;
  for (var r3 = 0; r3 < nRows; r3++) { rowY[r3] = y; y += rowH[r3] + gapY[r3]; }

  var positions: Record<string, Position> = {};
  var all: Screen[] = [];
  cells.forEach(function (row, r4) {
    row.forEach(function (s2, c4) {
      if (!s2) return;
      positions[s2.id] = { x: colX[c4], y: rowY[r4] };
      all.push(s2);
    });
  });
  var totalW = nCols ? colX[nCols - 1] + colW[nCols - 1] : 0;
  var totalH = nRows ? rowY[nRows - 1] + rowH[nRows - 1] : 0;
  centerPositions(positions, all, totalW, totalH);
  return positions;
}

// Columns (each a top → bottom list) → cells[row][col].
function columnsToCells(columns: Screen[][]): (Screen | null)[][] {
  var nRows = 0;
  columns.forEach(function (c) { if (c.length > nRows) nRows = c.length; });
  var cells: (Screen | null)[][] = [];
  for (var r = 0; r < nRows; r++) {
    cells[r] = [];
    for (var c = 0; c < columns.length; c++) cells[r][c] = columns[c][r] || null;
  }
  return cells;
}

// -- Flow: columns by journey depth (BFS on main/default arrows) --
export function autoLayout(screens: Screen[], arrows: Arrow[], heights?: Record<string, number>): Record<string, Position> {
  var core = layoutArrows(arrows);
  var col = bfsDepth(screens, core);

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

  return placeGrid(columnsToCells(split), arrows, heights);
}

// -- Epics: one row (swimlane) per epic, screens left → right in journey order --
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

  // Rows of different epics are separated a bit more (double base gap).
  return placeGrid(rows, arrows, heights, GAP_X, EPIC_ROW_GAP);
}

// -- Grid: rows of up to MAX_PER_ROW, screens grouped by epic then input order --
export function layoutGrid(screens: Screen[], arrows: Arrow[], heights?: Record<string, number>): Record<string, Position> {
  var n = screens.length;
  var perRow = Math.max(1, Math.min(MAX_PER_ROW, Math.ceil(Math.sqrt(n))));
  var ordered = screens.slice();
  var idx: Record<string, number> = {};
  screens.forEach(function (s, i) { idx[s.id] = i; });
  var epicRank: Record<string, number> = {};
  ((state.project && state.project.epics) || []).forEach(function (e, i) { epicRank[e.id] = i; });
  ordered.sort(function (a, b) {
    var ea = a.epic ? (epicRank[a.epic] !== undefined ? epicRank[a.epic] : 9999) : 10000;
    var eb = b.epic ? (epicRank[b.epic] !== undefined ? epicRank[b.epic] : 9999) : 10000;
    return (ea - eb) || (idx[a.id] - idx[b.id]);
  });
  var rows: Screen[][] = [];
  for (var i = 0; i < ordered.length; i += perRow) rows.push(ordered.slice(i, i + perRow));
  return placeGrid(rows, arrows, heights);
}

// -- Spacing: scale the gaps of the CURRENT positions (auto or hand-made) --
// Positions are scaled around `origin` (default: the top-left of the bounding
// box), so every gap grows (or shrinks) by `k` while screens keep their size.
// Passing the point under the viewport center keeps what the user is looking
// at in place.
export function spreadPositions(positions: Record<string, Position>, k: number, origin?: Position): Record<string, Position> {
  var ids = Object.keys(positions);
  if (!ids.length) return positions;
  var ox: number, oy: number;
  if (origin) { ox = origin.x; oy = origin.y; }
  else {
    ox = Infinity; oy = Infinity;
    ids.forEach(function (id) { ox = Math.min(ox, positions[id].x); oy = Math.min(oy, positions[id].y); });
  }
  var out: Record<string, Position> = {};
  ids.forEach(function (id) {
    out[id] = {
      x: Math.round(ox + (positions[id].x - ox) * k),
      y: Math.round(oy + (positions[id].y - oy) * k),
    };
  });
  return out;
}

// -- Layout strategies --
export var LAYOUT_STRATEGIES: { name: string; fn: (screens: Screen[], arrows: Arrow[], heights: Record<string, number>) => Record<string, Position> }[] = [
  { name: 'Flow', fn: autoLayout },
  { name: 'Epics', fn: layoutByEpics },
  { name: 'Grid', fn: layoutGrid }
];
