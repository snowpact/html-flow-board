import { describe, it, expect, beforeEach } from 'vitest';
import { state } from './src/core/state';
import { getPrimarySide, rectsIntersect, toggleSelection } from './src/core/geometry';
import {
  getAnchor, computeControlPoints, getAllAnchorPoints,
  getBestSides, buildSpreadMap, resolveArrowSides,
} from './src/arrows';
import { autoLayout, bfsDepth, centerPositions, layoutByEpics, layoutGrid } from './src/layout';
import { PRESETS, getPreset, isCustomPreset, skeletonHtml } from './src/render/presets';

// Reset the shared state singleton between tests (modules are imported directly,
// so state persists across cases within the file).
function resetState() {
  state.zoom = 1; state.panX = 0; state.panY = 0;
  state.mode = 'drag'; state.selected = {}; state.selectBox = null; state.screenDrag = null;
  state.pointerInBoard = false; state._dotZoom = null;
  state.project = null; state.positions = {}; state.defaultPositions = {};
  state.screenEls = {}; state.hiddenEpics = {}; state.hiddenScreens = {};
  state.showNotes = true; state.layoutIndex = 0;
}

// Populate state with mock positioned screens (jsdom has no layout engine, so
// offsetWidth/offsetHeight are stubbed to 320x300).
function setupState(screens, arrows, positions) {
  resetState();
  state.project = { name: 'test', epics: [{ id: 'e1', label: 'Epic', color: '#000' }], screens: screens, arrows: arrows || [] };
  state.positions = positions || {};
  screens.forEach(function (s) {
    var el = document.createElement('div');
    el.dataset.screenId = s.id;
    Object.defineProperty(el, 'offsetWidth', { value: 320, configurable: true });
    Object.defineProperty(el, 'offsetHeight', { value: 300, configurable: true });
    state.screenEls[s.id] = el;
  });
}

describe('getPrimarySide', () => {
  beforeEach(() => { resetState(); });

  it('returns single side as-is', () => {
    expect(getPrimarySide('right')).toBe('right');
    expect(getPrimarySide('left')).toBe('left');
    expect(getPrimarySide('top')).toBe('top');
    expect(getPrimarySide('bottom')).toBe('bottom');
  });

  it('extracts primary from compound side', () => {
    expect(getPrimarySide('right-top')).toBe('right');
    expect(getPrimarySide('left-bottom')).toBe('left');
    expect(getPrimarySide('top-left')).toBe('top');
    expect(getPrimarySide('bottom-right')).toBe('bottom');
    expect(getPrimarySide('right-upper')).toBe('right');
    expect(getPrimarySide('left-lower')).toBe('left');
  });

  it('defaults to right for falsy input', () => {
    expect(getPrimarySide(null)).toBe('right');
    expect(getPrimarySide(undefined)).toBe('right');
    expect(getPrimarySide('')).toBe('right');
  });
});

describe('getAnchor', () => {
  beforeEach(() => {
    resetState();
    setupState(
      [{ id: 'A', title: 'A', epic: 'e1' }],
      [],
      { A: { x: 100, y: 200 } }
    );
  });

  it('returns center for simple side names', () => {
    var a = getAnchor('A', 'right');
    expect(a).toEqual({ x: 100 + 320, y: 200 + 150 }); // x + w, y + h*0.5

    a = getAnchor('A', 'left');
    expect(a).toEqual({ x: 100, y: 200 + 150 });

    a = getAnchor('A', 'top');
    expect(a).toEqual({ x: 100 + 160, y: 200 });

    a = getAnchor('A', 'bottom');
    expect(a).toEqual({ x: 100 + 160, y: 200 + 300 });
  });

  it('handles left/right 5 sub-positions (1/6 to 5/6)', () => {
    var h = 300;
    expect(getAnchor('A', 'right-top').y).toBeCloseTo(200 + h * (1/6), 5);
    expect(getAnchor('A', 'right-upper').y).toBeCloseTo(200 + h * (2/6), 5);
    expect(getAnchor('A', 'right-middle').y).toBeCloseTo(200 + h * 0.5, 5);
    expect(getAnchor('A', 'right-lower').y).toBeCloseTo(200 + h * (4/6), 5);
    expect(getAnchor('A', 'right-bottom').y).toBeCloseTo(200 + h * (5/6), 5);
  });

  it('handles top/bottom 3 sub-positions (1/4, 1/2, 3/4)', () => {
    var w = 320;
    expect(getAnchor('A', 'top-left').x).toBeCloseTo(100 + w * 0.25, 5);
    expect(getAnchor('A', 'top').x).toBeCloseTo(100 + w * 0.5, 5);
    expect(getAnchor('A', 'top-right').x).toBeCloseTo(100 + w * 0.75, 5);
  });

  it('returns {0,0} for unknown screen', () => {
    expect(getAnchor('UNKNOWN', 'right')).toEqual({ x: 0, y: 0 });
  });
});

describe('computeControlPoints', () => {
  beforeEach(() => { resetState(); });

  it('offsets cp1 in primary direction + cross blend', () => {
    var start = { x: 0, y: 0 };
    var end = { x: 300, y: 200 };
    var cps = computeControlPoints(start, end, 'right', 'left');

    // cp1.x = 0 + 60 (ARROW_OFFSET)
    expect(cps.cp1.x).toBe(60);
    // cp1.y = 0 + 200 * 0.15 (ARROW_BLEND)
    expect(cps.cp1.y).toBeCloseTo(30, 5);

    // cp2.x = 300 - 60
    expect(cps.cp2.x).toBe(240);
    // cp2.y = 200 - 200 * 0.15
    expect(cps.cp2.y).toBeCloseTo(170, 5);
  });

  it('has no cross blend when screens are aligned', () => {
    var start = { x: 0, y: 100 };
    var end = { x: 400, y: 100 };
    var cps = computeControlPoints(start, end, 'right', 'left');

    expect(cps.cp1.y).toBe(100); // no vertical offset
    expect(cps.cp2.y).toBe(100);
  });

  it('works for vertical arrows', () => {
    var start = { x: 100, y: 0 };
    var end = { x: 300, y: 400 };
    var cps = computeControlPoints(start, end, 'bottom', 'top');

    // cp1: y += 60, x += dx*0.15 = 200*0.15 = 30
    expect(cps.cp1.x).toBeCloseTo(130, 5);
    expect(cps.cp1.y).toBe(60);

    // cp2: y -= 60, x -= dx*0.15 = 200*0.15 = 30
    expect(cps.cp2.x).toBeCloseTo(270, 5);
    expect(cps.cp2.y).toBe(340);
  });
});

describe('getAllAnchorPoints', () => {
  beforeEach(() => {
    resetState();
    setupState(
      [{ id: 'A', title: 'A', epic: 'e1' }],
      [],
      { A: { x: 0, y: 0 } }
    );
  });

  it('returns 16 anchor points', () => {
    var points = getAllAnchorPoints('A');
    expect(points).toHaveLength(16);
  });

  it('returns correct names', () => {
    var names = getAllAnchorPoints('A').map(function (p) { return p.name; });
    expect(names).toContain('left-top');
    expect(names).toContain('left-upper');
    expect(names).toContain('left-middle');
    expect(names).toContain('left-lower');
    expect(names).toContain('left-bottom');
    expect(names).toContain('right-top');
    expect(names).toContain('top-left');
    expect(names).toContain('top');
    expect(names).toContain('top-right');
    expect(names).toContain('bottom-left');
    expect(names).toContain('bottom');
    expect(names).toContain('bottom-right');
  });

  it('all points have x and y numbers', () => {
    getAllAnchorPoints('A').forEach(function (p) {
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
      expect(isNaN(p.x)).toBe(false);
      expect(isNaN(p.y)).toBe(false);
    });
  });
});

describe('getBestSides', () => {
  beforeEach(() => {
    resetState();
    setupState(
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [],
      { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }
    );
  });

  it('returns right→left when B is to the right of A', () => {
    var sides = getBestSides(
      state.screenEls.A,
      state.screenEls.B
    );
    expect(sides).toEqual({ from: 'right', to: 'left' });
  });

  it('returns left→right when B is to the left of A', () => {
    state.positions.B = { x: -500, y: 0 };
    var sides = getBestSides(
      state.screenEls.A,
      state.screenEls.B
    );
    expect(sides).toEqual({ from: 'left', to: 'right' });
  });

  it('returns bottom→top when B is below A', () => {
    state.positions.B = { x: 0, y: 500 };
    var sides = getBestSides(
      state.screenEls.A,
      state.screenEls.B
    );
    expect(sides).toEqual({ from: 'bottom', to: 'top' });
  });

  it('returns top→bottom when B is above A', () => {
    state.positions.B = { x: 0, y: -500 };
    var sides = getBestSides(
      state.screenEls.A,
      state.screenEls.B
    );
    expect(sides).toEqual({ from: 'top', to: 'bottom' });
  });
});

describe('buildSpreadMap', () => {
  beforeEach(() => {
    resetState();
  });

  it('returns empty map when no pair has multiple arrows', () => {
    setupState(
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [{ from: 'A', to: 'B' }],
      { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }
    );
    expect(buildSpreadMap()).toEqual({});
  });

  it('spreads 2 arrows between same pair', () => {
    setupState(
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'A' },
      ],
      { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }
    );

    var map = buildSpreadMap();
    // Index-based map: arrow 0 = A->B, arrow 1 = B->A
    expect(map[0]).toBeDefined();
    expect(map[1]).toBeDefined();

    // A is left, B is right → horizontal → suffixes -upper, -lower
    expect(map[0].from).toBe('right-upper');
    expect(map[0].to).toBe('left-upper');
    expect(map[1].from).toBe('left-lower');
    expect(map[1].to).toBe('right-lower');
  });

  it('skips arrows with explicit sides but keeps group size', () => {
    setupState(
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [
        { from: 'A', to: 'B', fromSide: 'right-top', toSide: 'left-top' },
        { from: 'B', to: 'A' },
      ],
      { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }
    );

    var map = buildSpreadMap();
    // Arrow 0 has explicit sides → not in spread map
    expect(map[0]).toBeUndefined();
    // Arrow 1 still gets its spread position (index 1 in group of 2)
    expect(map[1]).toBeDefined();
    expect(map[1].from).toBe('left-lower');
  });

  it('skips hidden screen arrows', () => {
    setupState(
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'A' },
      ],
      { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }
    );
    state.hiddenScreens.A = true;

    expect(buildSpreadMap()).toEqual({});
  });
});

describe('resolveArrowSides', () => {
  beforeEach(() => {
    resetState();
    setupState(
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [{ from: 'A', to: 'B' }],
      { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }
    );
  });

  it('uses arrow fromSide/toSide when present', () => {
    var sides = resolveArrowSides({ from: 'A', to: 'B', fromSide: 'top', toSide: 'bottom' }, 0, {});
    expect(sides).toEqual({ from: 'top', to: 'bottom' });
  });

  it('uses spread map when no explicit sides', () => {
    var spreadMap = { 0: { from: 'right-upper', to: 'left-upper' } };
    var sides = resolveArrowSides({ from: 'A', to: 'B' }, 0, spreadMap);
    expect(sides).toEqual({ from: 'right-upper', to: 'left-upper' });
  });

  it('falls back to auto-detect', () => {
    var sides = resolveArrowSides({ from: 'A', to: 'B' }, 0, {});
    expect(sides).toEqual({ from: 'right', to: 'left' });
  });

  it('arrow sides take priority over spread', () => {
    var spreadMap = { 0: { from: 'right-upper', to: 'left-upper' } };
    var sides = resolveArrowSides({ from: 'A', to: 'B', fromSide: 'bottom', toSide: 'top' }, 0, spreadMap);
    expect(sides).toEqual({ from: 'bottom', to: 'top' });
  });
});

describe('autoLayout', () => {
  beforeEach(() => { resetState(); });

  it('assigns screens to columns based on arrows', () => {
    var screens = [
      { id: 'a', size: 'md' },
      { id: 'b', size: 'md' },
      { id: 'c', size: 'md' },
    ];
    var arrows = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ];
    var pos = autoLayout(screens, arrows);

    // a is root → col 0, b → col 1, c → col 2
    // So a.x < b.x < c.x
    expect(pos.a.x).toBeLessThan(pos.b.x);
    expect(pos.b.x).toBeLessThan(pos.c.x);
  });

  it('puts disconnected screens at column 0', () => {
    var screens = [
      { id: 'a', size: 'md' },
      { id: 'b', size: 'md' },
    ];
    var pos = autoLayout(screens, []);

    // Both in column 0 → same x
    expect(pos.a.x).toBe(pos.b.x);
    // Stacked vertically
    expect(pos.a.y).not.toBe(pos.b.y);
  });

  it('uses provided heights for vertical spacing', () => {
    var screens = [
      { id: 'a', size: 'md' },
      { id: 'b', size: 'md' },
    ];
    var pos = autoLayout(screens, [], { a: 100, b: 100 });
    // b.y = a.y + 100 (height) + 40 (GAP_Y)
    expect(pos.b.y - pos.a.y).toBe(140);
  });

  it('respects screen sizes for column width', () => {
    var screens = [
      { id: 'a', size: 'lg' },
      { id: 'b', size: 'sm' },
    ];
    var arrows = [{ from: 'a', to: 'b' }];
    var pos = autoLayout(screens, arrows);
    // a is lg (400), gap is 100 → b.x - a.x = 500
    expect(pos.b.x - pos.a.x).toBe(500);
  });

  it('handles xl size screens', () => {
    var screens = [
      { id: 'a', size: 'xl' },
      { id: 'b', size: 'md' },
    ];
    var arrows = [{ from: 'a', to: 'b' }];
    var pos = autoLayout(screens, arrows);
    // xl = 520, gap = 100
    expect(pos.b.x - pos.a.x).toBe(620);
  });

  it('handles branching arrows (one root, two children)', () => {
    var screens = [
      { id: 'a', size: 'md' },
      { id: 'b', size: 'md' },
      { id: 'c', size: 'md' },
    ];
    var arrows = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
    ];
    var pos = autoLayout(screens, arrows);
    // b and c both in column 1 → same x, different y
    expect(pos.b.x).toBe(pos.c.x);
    expect(pos.b.y).not.toBe(pos.c.y);
    expect(pos.a.x).toBeLessThan(pos.b.x);
  });

  it('handles single screen', () => {
    var pos = autoLayout([{ id: 'solo', size: 'md' }], []);
    expect(pos.solo).toBeDefined();
    expect(typeof pos.solo.x).toBe('number');
    expect(typeof pos.solo.y).toBe('number');
  });
});

// ─────────────────────────────────────────────────
// bfsDepth
// ─────────────────────────────────────────────────
describe('bfsDepth', () => {
  beforeEach(() => { resetState(); });

  it('assigns root at depth 0, children at depth 1, etc.', () => {
    var screens = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    var arrows = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }];
    var col = bfsDepth(screens, arrows);
    expect(col.a).toBe(0);
    expect(col.b).toBe(1);
    expect(col.c).toBe(2);
  });

  it('puts disconnected screens at depth 0', () => {
    var screens = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    var arrows = [{ from: 'a', to: 'b' }];
    var col = bfsDepth(screens, arrows);
    expect(col.a).toBe(0);
    expect(col.b).toBe(1);
    expect(col.c).toBe(0); // disconnected → depth 0
  });

  it('handles multiple roots', () => {
    var screens = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    var arrows = [{ from: 'a', to: 'c' }, { from: 'b', to: 'd' }];
    var col = bfsDepth(screens, arrows);
    expect(col.a).toBe(0);
    expect(col.b).toBe(0);
    expect(col.c).toBe(1);
    expect(col.d).toBe(1);
  });

  it('handles cyclic graphs by visiting first-seen only', () => {
    var screens = [{ id: 'a' }, { id: 'b' }];
    var arrows = [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }];
    var col = bfsDepth(screens, arrows);
    // a is root (no parent from b since a is already root)
    // Actually both have parents → uses first screen as root
    expect(col.a).toBeDefined();
    expect(col.b).toBeDefined();
  });

  it('handles empty screens list', () => {
    var col = bfsDepth([], []);
    expect(col).toEqual({});
  });

  it('handles branching graph', () => {
    var screens = [{ id: 'root' }, { id: 'l' }, { id: 'r' }, { id: 'll' }];
    var arrows = [
      { from: 'root', to: 'l' },
      { from: 'root', to: 'r' },
      { from: 'l', to: 'll' },
    ];
    var col = bfsDepth(screens, arrows);
    expect(col.root).toBe(0);
    expect(col.l).toBe(1);
    expect(col.r).toBe(1);
    expect(col.ll).toBe(2);
  });
});

// ─────────────────────────────────────────────────
// centerPositions
// ─────────────────────────────────────────────────
describe('centerPositions', () => {
  beforeEach(() => { resetState(); });

  it('centers positions on the canvas', () => {
    var screens = [{ id: 'a' }, { id: 'b' }];
    var positions = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
    centerPositions(positions, screens, 100, 200);
    // CANVAS_W = 10000, totalW = 100 → cx = (10000 - 100) / 2 = 4950
    // CANVAS_H = 8000, totalH = 200 → cy = (8000 - 200) / 2 = 3900
    expect(positions.a.x).toBe(4950);
    expect(positions.a.y).toBe(3900);
    expect(positions.b.x).toBe(5050);
    expect(positions.b.y).toBe(3900);
  });

  it('does not go below 0 for very large content', () => {
    var screens = [{ id: 'a' }];
    var positions = { a: { x: 0, y: 0 } };
    centerPositions(positions, screens, 20000, 20000);
    // (10000 - 20000) / 2 = -5000 → max(0, -5000) = 0
    expect(positions.a.x).toBe(0);
    expect(positions.a.y).toBe(0);
  });

  it('skips screens not in positions', () => {
    var screens = [{ id: 'a' }, { id: 'missing' }];
    var positions = { a: { x: 0, y: 0 } };
    // Should not throw
    centerPositions(positions, screens, 100, 100);
    expect(positions.a).toBeDefined();
  });
});

// ─────────────────────────────────────────────────
// layoutByEpics
// ─────────────────────────────────────────────────
describe('layoutByEpics', () => {
  beforeEach(() => { resetState(); });

  it('groups screens by epic in separate columns', () => {
    var screens = [
      { id: 'a', epic: 'e1', size: 'md' },
      { id: 'b', epic: 'e2', size: 'md' },
    ];
    var pos = layoutByEpics(screens, []);
    // Different epics → different columns → different x
    expect(pos.a.x).not.toBe(pos.b.x);
  });

  it('stacks screens of same epic vertically', () => {
    var screens = [
      { id: 'a', epic: 'e1', size: 'md' },
      { id: 'b', epic: 'e1', size: 'md' },
    ];
    var pos = layoutByEpics(screens, []);
    // Same epic → same column → same x offset (before centering)
    expect(pos.a.x).toBe(pos.b.x);
    expect(pos.a.y).not.toBe(pos.b.y);
  });

  it('sorts screens within epic by BFS depth', () => {
    var screens = [
      { id: 'c', epic: 'e1', size: 'md' },
      { id: 'a', epic: 'e1', size: 'md' },
      { id: 'b', epic: 'e1', size: 'md' },
    ];
    var arrows = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }];
    var pos = layoutByEpics(screens, arrows);
    // a depth 0, b depth 1, c depth 2 → sorted by depth
    // So a.y < b.y < c.y
    expect(pos.a.y).toBeLessThan(pos.b.y);
    expect(pos.b.y).toBeLessThan(pos.c.y);
  });

  it('handles screens without epic as _none group', () => {
    var screens = [
      { id: 'a', size: 'md' },
      { id: 'b', epic: 'e1', size: 'md' },
    ];
    var pos = layoutByEpics(screens, []);
    expect(pos.a).toBeDefined();
    expect(pos.b).toBeDefined();
    // Different groups → different x
    expect(pos.a.x).not.toBe(pos.b.x);
  });

  it('uses provided heights for spacing', () => {
    var screens = [
      { id: 'a', epic: 'e1', size: 'md' },
      { id: 'b', epic: 'e1', size: 'md' },
    ];
    var pos = layoutByEpics(screens, [], { a: 150, b: 150 });
    // b.y - a.y = 150 + 40 (GAP_Y) = 190
    expect(pos.b.y - pos.a.y).toBe(190);
  });
});

// ─────────────────────────────────────────────────
// layoutGrid
// ─────────────────────────────────────────────────
describe('layoutGrid', () => {
  beforeEach(() => { resetState(); });

  it('arranges screens in a grid', () => {
    var screens = [
      { id: 'a', size: 'md' },
      { id: 'b', size: 'md' },
      { id: 'c', size: 'md' },
      { id: 'd', size: 'md' },
    ];
    var pos = layoutGrid(screens, []);
    // 4 screens → sqrt(4) = 2 cols
    // a,b in row 0; c,d in row 1
    expect(pos.a.x).toBeLessThan(pos.b.x);
    expect(pos.a.y).toBe(pos.b.y); // same row
    expect(pos.c.x).toBeLessThan(pos.d.x);
    expect(pos.c.y).toBe(pos.d.y); // same row
    expect(pos.a.y).toBeLessThan(pos.c.y); // different rows
  });

  it('wraps to next row after reaching column count', () => {
    var screens = [
      { id: 'a', size: 'md' },
      { id: 'b', size: 'md' },
      { id: 'c', size: 'md' },
    ];
    var pos = layoutGrid(screens, []);
    // 3 screens → cols = round(sqrt(3)) = 2
    // a,b in row 0; c in row 1
    expect(pos.a.y).toBe(pos.b.y);
    expect(pos.c.y).toBeGreaterThan(pos.a.y);
  });

  it('handles single screen', () => {
    var pos = layoutGrid([{ id: 'a', size: 'md' }], []);
    expect(pos.a).toBeDefined();
    expect(typeof pos.a.x).toBe('number');
  });

  it('uses provided heights for row spacing', () => {
    var screens = [
      { id: 'a', size: 'md' },
      { id: 'b', size: 'md' },
      { id: 'c', size: 'md' },
    ];
    // cols = 2, so a,b in row 0, c in row 1
    var pos = layoutGrid(screens, [], { a: 120, b: 120, c: 120 });
    // Row 0 maxH = 120, GAP_Y = 40 → c.y - a.y = 160
    expect(pos.c.y - pos.a.y).toBe(160);
  });

  it('respects different screen sizes for horizontal spacing', () => {
    // Need 4+ screens so cols >= 2
    var screens = [
      { id: 'a', size: 'sm' },
      { id: 'b', size: 'lg' },
      { id: 'c', size: 'md' },
      { id: 'd', size: 'md' },
    ];
    var pos = layoutGrid(screens, []);
    // 4 screens → cols = round(sqrt(4)) = 2
    // a is sm (240), gap = 100 → b.x - a.x = 340
    expect(pos.b.x - pos.a.x).toBe(340);
  });
});

// ─────────────────────────────────────────────────
// getAnchor — edge cases
// ─────────────────────────────────────────────────
describe('getAnchor edge cases', () => {
  beforeEach(() => {
    resetState();
    setupState(
      [{ id: 'A', title: 'A', epic: 'e1' }],
      [],
      { A: { x: 100, y: 200 } }
    );
  });

  it('returns center for unknown side name', () => {
    var a = getAnchor('A', 'unknown');
    // default case → center of element
    expect(a.x).toBe(100 + 160); // x + w/2
    expect(a.y).toBe(200 + 150); // y + h/2
  });

  it('handles null side', () => {
    var a = getAnchor('A', null);
    expect(a.x).toBe(100 + 160);
    expect(a.y).toBe(200 + 150);
  });

  it('handles left sub-positions', () => {
    var h = 300;
    expect(getAnchor('A', 'left-top').y).toBeCloseTo(200 + h * (1/6), 5);
    expect(getAnchor('A', 'left-upper').y).toBeCloseTo(200 + h * (2/6), 5);
    expect(getAnchor('A', 'left-middle').y).toBeCloseTo(200 + h * 0.5, 5);
    expect(getAnchor('A', 'left-lower').y).toBeCloseTo(200 + h * (4/6), 5);
    expect(getAnchor('A', 'left-bottom').y).toBeCloseTo(200 + h * (5/6), 5);
    // All left sub-positions have x = pos.x = 100
    expect(getAnchor('A', 'left-top').x).toBe(100);
  });

  it('handles bottom sub-positions', () => {
    var w = 320;
    expect(getAnchor('A', 'bottom-left').x).toBeCloseTo(100 + w * 0.25, 5);
    expect(getAnchor('A', 'bottom').x).toBeCloseTo(100 + w * 0.5, 5);
    expect(getAnchor('A', 'bottom-right').x).toBeCloseTo(100 + w * 0.75, 5);
    // All bottom positions have y = pos.y + h = 500
    expect(getAnchor('A', 'bottom-left').y).toBe(500);
  });

  it('handles unknown sub-position with known primary as 0.5 fraction', () => {
    // right-foo → primary=right, fraction for 'foo' not in map → 0.5
    var a = getAnchor('A', 'right-foo');
    expect(a.y).toBeCloseTo(200 + 300 * 0.5, 5);
    expect(a.x).toBe(100 + 320);
  });
});

// ─────────────────────────────────────────────────
// computeControlPoints — edge cases
// ─────────────────────────────────────────────────
describe('computeControlPoints edge cases', () => {
  beforeEach(() => { resetState(); });

  it('handles same start and end point', () => {
    var p = { x: 100, y: 100 };
    var cps = computeControlPoints(p, p, 'right', 'left');
    // dx=0, dy=0 → no cross blend
    expect(cps.cp1.x).toBe(160); // 100 + 60
    expect(cps.cp1.y).toBe(100);
    expect(cps.cp2.x).toBe(40);  // 100 - 60
    expect(cps.cp2.y).toBe(100);
  });

  it('handles top→bottom vertical arrows', () => {
    var start = { x: 200, y: 0 };
    var end = { x: 200, y: 500 };
    var cps = computeControlPoints(start, end, 'top', 'bottom');
    // top: cp1.y -= 60, cp1.x += dx*BLEND = 0
    expect(cps.cp1.y).toBe(-60);
    expect(cps.cp1.x).toBe(200);
    // bottom: cp2.y += 60, cp2.x -= dx*BLEND = 0
    expect(cps.cp2.y).toBe(560);
    expect(cps.cp2.x).toBe(200);
  });

  it('handles compound sides by extracting primary', () => {
    var start = { x: 0, y: 0 };
    var end = { x: 300, y: 200 };
    // right-upper → primary is 'right', same as plain 'right'
    var cps1 = computeControlPoints(start, end, 'right-upper', 'left-lower');
    var cps2 = computeControlPoints(start, end, 'right', 'left');
    expect(cps1.cp1).toEqual(cps2.cp1);
    expect(cps1.cp2).toEqual(cps2.cp2);
  });

  it('handles left→right direction', () => {
    var start = { x: 500, y: 100 };
    var end = { x: 0, y: 100 };
    var cps = computeControlPoints(start, end, 'left', 'right');
    // left: cp1.x -= 60
    expect(cps.cp1.x).toBe(440);
    // right: cp2.x += 60
    expect(cps.cp2.x).toBe(60);
  });
});

// ─────────────────────────────────────────────────
// getBestSides — edge cases
// ─────────────────────────────────────────────────
describe('getBestSides edge cases', () => {
  beforeEach(() => {
    resetState();
    setupState(
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [],
      { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }
    );
  });

  it('prefers horizontal when dx > dy', () => {
    // B is far right → horizontal
    var sides = getBestSides(
      state.screenEls.A,
      state.screenEls.B
    );
    expect(['right', 'left']).toContain(sides.from);
  });

  it('prefers vertical when dy > dx', () => {
    state.positions.B = { x: 0, y: 800 };
    var sides = getBestSides(
      state.screenEls.A,
      state.screenEls.B
    );
    expect(['top', 'bottom']).toContain(sides.from);
  });

  it('returns diagonal-like sides for equal dx/dy', () => {
    state.positions.B = { x: 500, y: 500 };
    var sides = getBestSides(
      state.screenEls.A,
      state.screenEls.B
    );
    // Should still return a valid from/to
    expect(sides.from).toBeDefined();
    expect(sides.to).toBeDefined();
  });
});

// ─────────────────────────────────────────────────
// buildSpreadMap — edge cases
// ─────────────────────────────────────────────────
describe('buildSpreadMap edge cases', () => {
  beforeEach(() => { resetState(); });

  it('spreads 3 arrows between same pair', () => {
    setupState(
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'A' },
        { from: 'A', to: 'B' },
      ],
      { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }
    );

    var map = buildSpreadMap();
    // 3 horizontal arrows → suffixes: -upper, -middle, -lower
    expect(map[0].from).toContain('upper');
    expect(map[1].from).toContain('middle');
    expect(map[2].from).toContain('lower');
  });

  it('spreads vertical arrows with left/right suffixes', () => {
    setupState(
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'A' },
      ],
      { A: { x: 0, y: 0 }, B: { x: 0, y: 500 } }
    );

    var map = buildSpreadMap();
    // Vertical → suffixes: -left, -right
    expect(map[0].from).toContain('left');
    expect(map[1].from).toContain('right');
  });

  it('handles mix of explicit and auto arrows', () => {
    setupState(
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [
        { from: 'A', to: 'B', fromSide: 'top', toSide: 'bottom' },
        { from: 'B', to: 'A' },
        { from: 'A', to: 'B' },
      ],
      { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }
    );

    var map = buildSpreadMap();
    expect(map[0]).toBeUndefined(); // explicit → skipped
    expect(map[1]).toBeDefined();
    expect(map[2]).toBeDefined();
  });

  it('returns empty map when all arrows have explicit sides', () => {
    setupState(
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [
        { from: 'A', to: 'B', fromSide: 'right', toSide: 'left' },
        { from: 'B', to: 'A', fromSide: 'left', toSide: 'right' },
      ],
      { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }
    );

    var map = buildSpreadMap();
    expect(map).toEqual({});
  });

  it('handles no project gracefully', () => {
    state.project = null;
    var map = buildSpreadMap();
    expect(map).toEqual({});
  });
});

// ─────────────────────────────────────────────────
// resolveArrowSides — edge cases
// ─────────────────────────────────────────────────
describe('resolveArrowSides edge cases', () => {
  beforeEach(() => {
    resetState();
    setupState(
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [{ from: 'A', to: 'B' }],
      { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }
    );
  });

  it('uses only fromSide when toSide is missing (fallback to auto-detect for to)', () => {
    // Only fromSide set → needs both for explicit path; falls back
    var sides = resolveArrowSides({ from: 'A', to: 'B', fromSide: 'top' }, 0, {});
    // fromSide AND toSide must both be set for explicit; with only fromSide, it goes to spread/auto
    expect(sides.from).toBeDefined();
    expect(sides.to).toBeDefined();
  });

  it('auto-detects bottom→top when B is below', () => {
    state.positions.B = { x: 0, y: 600 };
    var sides = resolveArrowSides({ from: 'A', to: 'B' }, 0, {});
    expect(sides).toEqual({ from: 'bottom', to: 'top' });
  });

  it('auto-detects left→right when B is to the left', () => {
    state.positions.B = { x: -600, y: 0 };
    var sides = resolveArrowSides({ from: 'A', to: 'B' }, 0, {});
    expect(sides).toEqual({ from: 'left', to: 'right' });
  });
});

// ─────────────────────────────────────────────────
// getAllAnchorPoints — edge cases
// ─────────────────────────────────────────────────
describe('getAllAnchorPoints edge cases', () => {
  beforeEach(() => {
    resetState();
    setupState(
      [{ id: 'A', title: 'A', epic: 'e1' }],
      [],
      { A: { x: 0, y: 0 } }
    );
  });

  it('returns {0,0} points for unknown screen', () => {
    var points = getAllAnchorPoints('UNKNOWN');
    // Still returns 16 named points, but all at {0,0}
    expect(points).toHaveLength(16);
    points.forEach(function (p) {
      expect(p.x).toBe(0);
      expect(p.y).toBe(0);
    });
  });

  it('anchor points are within screen bounds', () => {
    var points = getAllAnchorPoints('A');
    points.forEach(function (p) {
      // All points should be on the edges of the element (0,0) to (320,300)
      var onEdge = (p.x === 0 || p.x === 320 || p.y === 0 || p.y === 300);
      expect(onEdge).toBe(true);
    });
  });

  it('left and right points share x values', () => {
    var points = getAllAnchorPoints('A');
    var leftPoints = points.filter(function (p) { return p.name.startsWith('left'); });
    var rightPoints = points.filter(function (p) { return p.name.startsWith('right'); });
    leftPoints.forEach(function (p) { expect(p.x).toBe(0); });
    rightPoints.forEach(function (p) { expect(p.x).toBe(320); });
  });

  it('top and bottom points share y values', () => {
    var points = getAllAnchorPoints('A');
    var topPoints = points.filter(function (p) { return p.name.startsWith('top'); });
    var bottomPoints = points.filter(function (p) { return p.name.startsWith('bottom'); });
    topPoints.forEach(function (p) { expect(p.y).toBe(0); });
    bottomPoints.forEach(function (p) { expect(p.y).toBe(300); });
  });
});

// ─────────────────────────────────────────────────
// getPrimarySide — more cases
// ─────────────────────────────────────────────────
describe('getPrimarySide extended', () => {
  beforeEach(() => { resetState(); });

  it('handles triple-hyphenated sides', () => {
    // Hypothetical: only first part matters
    expect(getPrimarySide('right-upper-extra')).toBe('right');
  });

  it('handles single character input', () => {
    expect(getPrimarySide('r')).toBe('r');
  });
});

// ─────────────────────────────────────────────────
// rectsIntersect — axis-aligned rectangle overlap (selection hit-test)
// ─────────────────────────────────────────────────
describe('rectsIntersect', () => {
  beforeEach(() => { resetState(); });

  it('returns true for overlapping rectangles', () => {
    var a = { left: 0, top: 0, right: 100, bottom: 100 };
    var b = { left: 50, top: 50, right: 150, bottom: 150 };
    expect(rectsIntersect(a, b)).toBe(true);
  });

  it('returns true when one rect fully contains the other', () => {
    var outer = { left: 0, top: 0, right: 200, bottom: 200 };
    var inner = { left: 50, top: 50, right: 100, bottom: 100 };
    expect(rectsIntersect(outer, inner)).toBe(true);
    expect(rectsIntersect(inner, outer)).toBe(true);
  });

  it('returns false when separated horizontally', () => {
    var a = { left: 0, top: 0, right: 100, bottom: 100 };
    var b = { left: 200, top: 0, right: 300, bottom: 100 };
    expect(rectsIntersect(a, b)).toBe(false);
  });

  it('returns false when separated vertically', () => {
    var a = { left: 0, top: 0, right: 100, bottom: 100 };
    var b = { left: 0, top: 200, right: 100, bottom: 300 };
    expect(rectsIntersect(a, b)).toBe(false);
  });

  it('returns false when edges only touch (zero overlap area)', () => {
    var a = { left: 0, top: 0, right: 100, bottom: 100 };
    var b = { left: 100, top: 0, right: 200, bottom: 100 };
    expect(rectsIntersect(a, b)).toBe(false);
  });
});

// ─────────────────────────────────────────────────
// toggleSelection — add/remove a screen id from the selection map
// ─────────────────────────────────────────────────
describe('toggleSelection', () => {
  beforeEach(() => { resetState(); });

  it('adds an id to an empty selection', () => {
    var sel = {};
    toggleSelection(sel, 'A');
    expect(sel).toEqual({ A: true });
  });

  it('removes an id that is already selected', () => {
    var sel = { A: true };
    toggleSelection(sel, 'A');
    expect(sel.A).toBeUndefined();
  });

  it('leaves other selected ids untouched when toggling one', () => {
    var sel = { A: true, B: true };
    toggleSelection(sel, 'A');
    expect(sel.A).toBeUndefined();
    expect(sel.B).toBe(true);
  });

  it('returns the same selection object', () => {
    var sel = {};
    expect(toggleSelection(sel, 'A')).toBe(sel);
  });
});

// ─────────────────────────────────────────────────
// presets — display-type registry + skeleton bodies
// ─────────────────────────────────────────────────
describe('presets', () => {
  it('has 15 presets including custom', () => {
    expect(PRESETS).toHaveLength(15);
    expect(PRESETS.map((p) => p.id)).toContain('custom');
  });

  it('custom is special: no skeleton html', () => {
    expect(isCustomPreset('custom')).toBe(true);
    expect(skeletonHtml('custom')).toBe('');
  });

  it('absent preset counts as custom', () => {
    expect(isCustomPreset(undefined)).toBe(true);
  });

  it('every non-custom preset produces non-empty skeleton html', () => {
    PRESETS.filter((p) => p.id !== 'custom').forEach((p) => {
      expect(isCustomPreset(p.id)).toBe(false);
      expect(skeletonHtml(p.id).length).toBeGreaterThan(0);
    });
  });

  it('skeleton html contains only grey shapes, no real text', () => {
    PRESETS.filter((p) => p.id !== 'custom').forEach((p) => {
      var html = skeletonHtml(p.id);
      // strip tags; the remainder must be empty (no text content)
      expect(html.replace(/<[^>]*>/g, '').trim()).toBe('');
    });
  });

  it('every preset has a human label', () => {
    PRESETS.forEach((p) => expect(typeof p.label).toBe('string'));
    expect(getPreset('form').label).toBe('Form');
  });
});
