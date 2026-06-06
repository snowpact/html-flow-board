import { CANVAS_H, CANVAS_W, GAP_X, GAP_Y } from './core/constants';
import { screenWidth } from './core/state';
import { Arrow, Position, Screen } from './core/types';

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

// -- Auto layout (Flow) --
export function autoLayout(screens: Screen[], arrows: Arrow[], heights?: Record<string, number>): Record<string, Position> {
  var col = bfsDepth(screens, arrows);

  // Group by column
  var columns: Record<string, Screen[]> = {};
  screens.forEach(function (s) {
    var c = col[s.id];
    if (!columns[c]) columns[c] = [];
    columns[c].push(s);
  });

  // Compute positions (first pass: relative to 0,0)
  var positions: Record<string, Position> = {};
  var colKeys = Object.keys(columns).map(Number).sort(function (a, b) { return a - b; });
  var offsetX = 0;
  var totalH = 0;

  colKeys.forEach(function (c) {
    var colScreens = columns[c];
    var maxW = 0;
    colScreens.forEach(function (s) {
      var w = screenWidth(s);
      if (w > maxW) maxW = w;
    });

    var offsetY = 0;
    colScreens.forEach(function (s) {
      positions[s.id] = { x: offsetX, y: offsetY };
      var h = (heights && heights[s.id]) ? heights[s.id] : 200;
      offsetY += h + GAP_Y;
    });

    if (offsetY - GAP_Y > totalH) totalH = offsetY - GAP_Y;
    offsetX += maxW + GAP_X;
  });
  var totalW = offsetX - GAP_X;

  centerPositions(positions, screens, totalW, totalH);
  return positions;
}

// -- Layout by Epics --
export function layoutByEpics(screens: Screen[], arrows: Arrow[], heights: Record<string, number>): Record<string, Position> {
  var epicGroups: Record<string, Screen[]> = {};
  var epicOrder: string[] = [];
  screens.forEach(function (s) {
    var eid = s.epic || '_none';
    if (!epicGroups[eid]) { epicGroups[eid] = []; epicOrder.push(eid); }
    epicGroups[eid].push(s);
  });

  var col = bfsDepth(screens, arrows);

  var positions: Record<string, Position> = {};
  var offsetX = 0;
  var totalH = 0;

  epicOrder.forEach(function (eid) {
    var group = epicGroups[eid];
    group.sort(function (a, b) { return (col[a.id] || 0) - (col[b.id] || 0); });

    var maxW = 0;
    group.forEach(function (s) {
      var w = screenWidth(s);
      if (w > maxW) maxW = w;
    });

    var offsetY = 0;
    group.forEach(function (s) {
      positions[s.id] = { x: offsetX, y: offsetY };
      var h = (heights && heights[s.id]) ? heights[s.id] : 200;
      offsetY += h + GAP_Y;
    });
    if (offsetY - GAP_Y > totalH) totalH = offsetY - GAP_Y;
    offsetX += maxW + GAP_X;
  });

  centerPositions(positions, screens, offsetX - GAP_X, totalH);
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
export var LAYOUT_STRATEGIES = [
  { name: 'Flow', fn: autoLayout },
  { name: 'Epics', fn: layoutByEpics },
  { name: 'Grid', fn: layoutGrid }
];

// -- Cycle layout --
