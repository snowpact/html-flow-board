import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Load the IIFE into jsdom's window
const src = fs.readFileSync(path.resolve(__dirname, 'flowboard.js'), 'utf-8');

function loadFlowBoard() {
  // Reset
  document.body.innerHTML = '<div id="app"></div>';
  eval(src);
  return window.FlowBoard;
}

// Helper: minimal project with positioned mock screens
function setupState(fb, screens, arrows, positions) {
  var state = fb._internal.state;
  state.project = {
    name: 'test',
    epics: [{ id: 'e1', label: 'Epic', color: '#000' }],
    screens: screens,
    arrows: arrows || [],
  };
  state.positions = positions || {};
  state.hiddenEpics = {};
  state.arrowOverrides = {};
  state.screenEls = {};

  // Create mock screen elements with offsetWidth/offsetHeight
  screens.forEach(function (s) {
    var el = document.createElement('div');
    el.dataset.screenId = s.id;
    // jsdom doesn't compute layout — override offsetWidth/offsetHeight
    Object.defineProperty(el, 'offsetWidth', { value: 320, configurable: true });
    Object.defineProperty(el, 'offsetHeight', { value: 300, configurable: true });
    state.screenEls[s.id] = el;
  });
}

describe('getPrimarySide', () => {
  let fb;
  beforeEach(() => { fb = loadFlowBoard(); });

  it('returns single side as-is', () => {
    expect(fb._internal.getPrimarySide('right')).toBe('right');
    expect(fb._internal.getPrimarySide('left')).toBe('left');
    expect(fb._internal.getPrimarySide('top')).toBe('top');
    expect(fb._internal.getPrimarySide('bottom')).toBe('bottom');
  });

  it('extracts primary from compound side', () => {
    expect(fb._internal.getPrimarySide('right-top')).toBe('right');
    expect(fb._internal.getPrimarySide('left-bottom')).toBe('left');
    expect(fb._internal.getPrimarySide('top-left')).toBe('top');
    expect(fb._internal.getPrimarySide('bottom-right')).toBe('bottom');
    expect(fb._internal.getPrimarySide('right-upper')).toBe('right');
    expect(fb._internal.getPrimarySide('left-lower')).toBe('left');
  });

  it('defaults to right for falsy input', () => {
    expect(fb._internal.getPrimarySide(null)).toBe('right');
    expect(fb._internal.getPrimarySide(undefined)).toBe('right');
    expect(fb._internal.getPrimarySide('')).toBe('right');
  });
});

describe('getAnchor', () => {
  let fb;
  beforeEach(() => {
    fb = loadFlowBoard();
    setupState(fb,
      [{ id: 'A', title: 'A', epic: 'e1' }],
      [],
      { A: { x: 100, y: 200 } }
    );
  });

  it('returns center for simple side names', () => {
    var a = fb._internal.getAnchor('A', 'right');
    expect(a).toEqual({ x: 100 + 320, y: 200 + 150 }); // x + w, y + h*0.5

    a = fb._internal.getAnchor('A', 'left');
    expect(a).toEqual({ x: 100, y: 200 + 150 });

    a = fb._internal.getAnchor('A', 'top');
    expect(a).toEqual({ x: 100 + 160, y: 200 });

    a = fb._internal.getAnchor('A', 'bottom');
    expect(a).toEqual({ x: 100 + 160, y: 200 + 300 });
  });

  it('handles left/right 5 sub-positions (1/6 to 5/6)', () => {
    var h = 300;
    expect(fb._internal.getAnchor('A', 'right-top').y).toBeCloseTo(200 + h * (1/6), 5);
    expect(fb._internal.getAnchor('A', 'right-upper').y).toBeCloseTo(200 + h * (2/6), 5);
    expect(fb._internal.getAnchor('A', 'right-middle').y).toBeCloseTo(200 + h * 0.5, 5);
    expect(fb._internal.getAnchor('A', 'right-lower').y).toBeCloseTo(200 + h * (4/6), 5);
    expect(fb._internal.getAnchor('A', 'right-bottom').y).toBeCloseTo(200 + h * (5/6), 5);
  });

  it('handles top/bottom 3 sub-positions (1/4, 1/2, 3/4)', () => {
    var w = 320;
    expect(fb._internal.getAnchor('A', 'top-left').x).toBeCloseTo(100 + w * 0.25, 5);
    expect(fb._internal.getAnchor('A', 'top').x).toBeCloseTo(100 + w * 0.5, 5);
    expect(fb._internal.getAnchor('A', 'top-right').x).toBeCloseTo(100 + w * 0.75, 5);
  });

  it('returns {0,0} for unknown screen', () => {
    expect(fb._internal.getAnchor('UNKNOWN', 'right')).toEqual({ x: 0, y: 0 });
  });
});

describe('computeControlPoints', () => {
  let fb;
  beforeEach(() => { fb = loadFlowBoard(); });

  it('offsets cp1 in primary direction + cross blend', () => {
    var start = { x: 0, y: 0 };
    var end = { x: 300, y: 200 };
    var cps = fb._internal.computeControlPoints(start, end, 'right', 'left');

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
    var cps = fb._internal.computeControlPoints(start, end, 'right', 'left');

    expect(cps.cp1.y).toBe(100); // no vertical offset
    expect(cps.cp2.y).toBe(100);
  });

  it('works for vertical arrows', () => {
    var start = { x: 100, y: 0 };
    var end = { x: 300, y: 400 };
    var cps = fb._internal.computeControlPoints(start, end, 'bottom', 'top');

    // cp1: y += 60, x += dx*0.15 = 200*0.15 = 30
    expect(cps.cp1.x).toBeCloseTo(130, 5);
    expect(cps.cp1.y).toBe(60);

    // cp2: y -= 60, x -= dx*0.15 = 200*0.15 = 30
    expect(cps.cp2.x).toBeCloseTo(270, 5);
    expect(cps.cp2.y).toBe(340);
  });
});

describe('getAllAnchorPoints', () => {
  let fb;
  beforeEach(() => {
    fb = loadFlowBoard();
    setupState(fb,
      [{ id: 'A', title: 'A', epic: 'e1' }],
      [],
      { A: { x: 0, y: 0 } }
    );
  });

  it('returns 16 anchor points', () => {
    var points = fb._internal.getAllAnchorPoints('A');
    expect(points).toHaveLength(16);
  });

  it('returns correct names', () => {
    var names = fb._internal.getAllAnchorPoints('A').map(function (p) { return p.name; });
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
    fb._internal.getAllAnchorPoints('A').forEach(function (p) {
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
      expect(isNaN(p.x)).toBe(false);
      expect(isNaN(p.y)).toBe(false);
    });
  });
});

describe('getBestSides', () => {
  let fb;
  beforeEach(() => {
    fb = loadFlowBoard();
    setupState(fb,
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [],
      { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }
    );
  });

  it('returns right→left when B is to the right of A', () => {
    var sides = fb._internal.getBestSides(
      fb._internal.state.screenEls.A,
      fb._internal.state.screenEls.B
    );
    expect(sides).toEqual({ from: 'right', to: 'left' });
  });

  it('returns left→right when B is to the left of A', () => {
    fb._internal.state.positions.B = { x: -500, y: 0 };
    var sides = fb._internal.getBestSides(
      fb._internal.state.screenEls.A,
      fb._internal.state.screenEls.B
    );
    expect(sides).toEqual({ from: 'left', to: 'right' });
  });

  it('returns bottom→top when B is below A', () => {
    fb._internal.state.positions.B = { x: 0, y: 500 };
    var sides = fb._internal.getBestSides(
      fb._internal.state.screenEls.A,
      fb._internal.state.screenEls.B
    );
    expect(sides).toEqual({ from: 'bottom', to: 'top' });
  });

  it('returns top→bottom when B is above A', () => {
    fb._internal.state.positions.B = { x: 0, y: -500 };
    var sides = fb._internal.getBestSides(
      fb._internal.state.screenEls.A,
      fb._internal.state.screenEls.B
    );
    expect(sides).toEqual({ from: 'top', to: 'bottom' });
  });
});

describe('buildSpreadMap', () => {
  let fb;
  beforeEach(() => {
    fb = loadFlowBoard();
  });

  it('returns empty map when no pair has multiple arrows', () => {
    setupState(fb,
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [{ from: 'A', to: 'B' }],
      { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }
    );
    expect(fb._internal.buildSpreadMap()).toEqual({});
  });

  it('spreads 2 arrows between same pair', () => {
    setupState(fb,
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

    var map = fb._internal.buildSpreadMap();
    expect(map['A->B']).toBeDefined();
    expect(map['B->A']).toBeDefined();

    // A is left, B is right → horizontal → suffixes -upper, -lower
    expect(map['A->B'].from).toBe('right-upper');
    expect(map['A->B'].to).toBe('left-upper');
    expect(map['B->A'].from).toBe('left-lower');
    expect(map['B->A'].to).toBe('right-lower');
  });

  it('skips overridden arrows but keeps group size', () => {
    setupState(fb,
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

    // Override the first arrow
    fb._internal.state.arrowOverrides['A->B'] = { fromSide: 'right-top', toSide: 'left-top' };

    var map = fb._internal.buildSpreadMap();
    // A->B is overridden → not in spread map
    expect(map['A->B']).toBeUndefined();
    // B->A still gets its spread position (index 1 in group of 2)
    expect(map['B->A']).toBeDefined();
    expect(map['B->A'].from).toBe('left-lower');
  });

  it('skips hidden epic arrows', () => {
    setupState(fb,
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
    fb._internal.state.hiddenEpics.e1 = true;

    expect(fb._internal.buildSpreadMap()).toEqual({});
  });
});

describe('resolveArrowSides', () => {
  let fb;
  beforeEach(() => {
    fb = loadFlowBoard();
    setupState(fb,
      [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
      ],
      [{ from: 'A', to: 'B' }],
      { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }
    );
  });

  it('uses override when present', () => {
    fb._internal.state.arrowOverrides['A->B'] = { fromSide: 'top', toSide: 'bottom' };
    var sides = fb._internal.resolveArrowSides({ from: 'A', to: 'B' }, {});
    expect(sides).toEqual({ from: 'top', to: 'bottom' });
  });

  it('uses spread map when no override', () => {
    var spreadMap = { 'A->B': { from: 'right-upper', to: 'left-upper' } };
    var sides = fb._internal.resolveArrowSides({ from: 'A', to: 'B' }, spreadMap);
    expect(sides).toEqual({ from: 'right-upper', to: 'left-upper' });
  });

  it('falls back to auto-detect', () => {
    var sides = fb._internal.resolveArrowSides({ from: 'A', to: 'B' }, {});
    expect(sides).toEqual({ from: 'right', to: 'left' });
  });

  it('override takes priority over spread', () => {
    fb._internal.state.arrowOverrides['A->B'] = { fromSide: 'bottom', toSide: 'top' };
    var spreadMap = { 'A->B': { from: 'right-upper', to: 'left-upper' } };
    var sides = fb._internal.resolveArrowSides({ from: 'A', to: 'B' }, spreadMap);
    expect(sides).toEqual({ from: 'bottom', to: 'top' });
  });
});

describe('autoLayout', () => {
  let fb;
  beforeEach(() => { fb = loadFlowBoard(); });

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
    var pos = fb._internal.autoLayout(screens, arrows);

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
    var pos = fb._internal.autoLayout(screens, []);

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
    var pos = fb._internal.autoLayout(screens, [], { a: 100, b: 100 });
    // b.y = a.y + 100 (height) + 40 (GAP_Y)
    expect(pos.b.y - pos.a.y).toBe(140);
  });
});
