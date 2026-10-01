import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from './src/flowml/parse';
import { serialize } from './src/flowml/serialize';
import { autoLayout, layoutArrows, layoutByEpics, layoutGrid, spreadPositions, LAYOUT_STRATEGIES } from './src/layout';
import { adjustSpacing } from './src/board';
import { collectExportBounds, isScreenShown } from './src/export';
import { isContentInView } from './src/interactions/transform';
import { GAP_X, GAP_Y } from './src/core/constants';
import { init } from './src/board';
import { state, screenEpics, inEpic } from './src/core/state';
import { setFocus, exitFocus, persistedPositions } from './src/focus';
import { commit } from './src/interactions/sync';
import { loadDoc } from './src/core/storage';
import { cycleArrowKind } from './src/render/popups';
import { toggleScreenEpic, setScreenEpic } from './src/render/screen';
import { deleteEpic } from './src/render/toolbar';
import { drawArrows, wrapLabel, bezierPoint } from './src/arrows';

describe('flow-ml: multi-epic screens + arrow kind', () => {
  const project = {
    name: 'Epics',
    epics: [{ id: 'close', label: 'Clôturer', color: '#e76f51' }, { id: 'mat', label: 'Matériel', color: '#f4a261' }],
    screens: [{ id: 'cloture', epic: 'close' }, { id: 'scan', epic: 'close', epics: ['close', 'mat'] }],
    arrows: [
      { from: 'cloture', to: 'scan', kind: 'main', label: 'Scanner' },
      { from: 'scan', to: 'cloture', kind: 'nav' },
    ],
  };

  it('serializes several epics as e="a b" and the kind as k=', () => {
    const out = serialize(project, {});
    expect(out).toContain(':cloture, e=close');
    expect(out).toContain(':scan, e="close mat"');
    expect(out).toContain('cloture -> scan, l=Scanner, k=main');
    expect(out).toContain('scan -> cloture, k=nav');
  });

  it('round-trips through parse()', () => {
    const back = parse(serialize(project, {}));
    expect(back.errors).toEqual([]);
    expect(back.project).toEqual(project);
  });

  it('keeps a legacy epic id containing a space whole', () => {
    const r = parse('@"my epic", t=Mine\n:a, e="my epic"\n');
    expect(r.project.screens[0].epic).toBe('my epic');
    expect(r.project.screens[0].epics).toBeUndefined();
  });

  it('ignores an unknown kind value', () => {
    expect(parse(':a\n:b\na -> b, k=bold\n').project.arrows[0].kind).toBeUndefined();
  });

  it('a % line is no longer valid Flow-ML (stories were merged into epics)', () => {
    expect(parse('%x, t=X\n').errors.length).toBe(1);
  });
});

describe('epic helpers', () => {
  it('screenEpics / inEpic cover primary and secondary epics', () => {
    const s = { id: 'x', epic: 'a', epics: ['a', 'b'] };
    expect(screenEpics(s)).toEqual(['a', 'b']);
    expect(inEpic(s, 'b')).toBe(true);
    expect(inEpic({ id: 'y', epic: 'a' }, 'b')).toBe(false);
  });
});

describe('layout', () => {
  it('has no Stories strategy anymore', () => {
    expect(LAYOUT_STRATEGIES.map((s) => s.name)).toEqual(['Flow', 'Epics', 'Grid']);
  });

  it('layoutArrows drops nav arrows (but keeps all if only nav)', () => {
    const arrows = [{ from: 'a', to: 'b', kind: 'nav' }, { from: 'a', to: 'c' }];
    expect(layoutArrows(arrows)).toEqual([{ from: 'a', to: 'c' }]);
    const onlyNav = [{ from: 'a', to: 'b', kind: 'nav' }];
    expect(layoutArrows(onlyNav)).toEqual(onlyNav);
  });

  it('a nav arrow does not push its target into a new column', () => {
    const screens = [{ id: 'menu', size: 'md' }, { id: 'a', size: 'md' }, { id: 'b', size: 'md' }];
    const arrows = [{ from: 'menu', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'menu', kind: 'nav' }];
    const pos = autoLayout(screens, arrows);
    expect(pos.menu.x).toBeLessThan(pos.a.x);
    expect(pos.a.x).toBeLessThan(pos.b.x);
  });

  it('orders a column by its parents to avoid crossings', () => {
    const screens = [{ id: 'r', size: 'md' }, { id: 'p1', size: 'md' }, { id: 'p2', size: 'md' }, { id: 'c2', size: 'md' }, { id: 'c1', size: 'md' }];
    const arrows = [{ from: 'r', to: 'p1' }, { from: 'r', to: 'p2' }, { from: 'p1', to: 'c1' }, { from: 'p2', to: 'c2' }];
    const pos = autoLayout(screens, arrows);
    expect(pos.p1.y).toBeLessThan(pos.p2.y);
    expect(pos.c1.y).toBeLessThan(pos.c2.y);
  });

  it('splits a crowded column into side-by-side sub-columns', () => {
    const screens = [{ id: 'root', size: 'md' }];
    const arrows = [];
    for (let i = 0; i < 12; i++) { screens.push({ id: 'k' + i, size: 'md' }); arrows.push({ from: 'root', to: 'k' + i }); }
    const pos = autoLayout(screens, arrows);
    expect(new Set(screens.slice(1).map((s) => pos[s.id].x)).size).toBe(2);
  });

  it('Epics layout places a multi-epic screen in its primary epic row', () => {
    const screens = [{ id: 'a', epic: 'e1', size: 'md' }, { id: 'b', epic: 'e2', epics: ['e2', 'e1'], size: 'md' }];
    const pos = layoutByEpics(screens, []);
    expect(pos.a.y).not.toBe(pos.b.y);
  });
});

describe('arrow labels', () => {
  it('wrapLabel splits long labels into at most 3 lines', () => {
    const lines = wrapLabel('Valider le départ : clôture et PV envoyés à SOOdispatch en arrière-plan avec les photos et la signature du client', 11, false);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines[lines.length - 1].endsWith('…')).toBe(true);
    expect(wrapLabel('Court', 11, false)).toEqual(['Court']);
  });

  it('bezierPoint returns the curve ends at t=0 and t=1', () => {
    const p0 = { x: 0, y: 0 }, p3 = { x: 100, y: 50 };
    expect(bezierPoint(p0, { x: 30, y: 0 }, { x: 70, y: 50 }, p3, 0)).toEqual(p0);
    expect(bezierPoint(p0, { x: 30, y: 0 }, { x: 70, y: 50 }, p3, 1)).toEqual(p3);
  });
});

describe('board: epic picker, focus, multi-epic, arrow kinds', () => {
  function initBoard() {
    document.body.innerHTML = '<div id="app"></div>';
    try { window.localStorage.clear(); } catch (e) {}
    if (!document.elementFromPoint) document.elementFromPoint = function () { return null; };
    state.focus = null; state.selected = {}; state.hiddenScreens = {}; state.screenEls = {};
    init({
      container: document.getElementById('app'),
      project: {
        name: 'EpicTest',
        epics: [{ id: 'e1', label: 'E1', color: '#f00' }, { id: 'e2', label: 'E2', color: '#0f0' }],
        screens: [
          { id: 'A', title: 'A', epic: 'e1' },
          { id: 'B', title: 'B', epic: 'e1' },
          { id: 'C', title: 'C', epic: 'e2', epics: ['e2', 'e1'] },
        ],
        arrows: [{ from: 'A', to: 'B', kind: 'main' }, { from: 'B', to: 'C', kind: 'nav' }, { from: 'C', to: 'A' }],
      },
      state: { positions: { A: { x: 10, y: 10 }, B: { x: 500, y: 10 }, C: { x: 1000, y: 10 } } },
    });
  }

  beforeEach(initBoard);

  it('the picker lists the whole board + every epic with its screen count (multi-epic counted)', () => {
    const items = Array.from(document.querySelectorAll('.fb-view-item'));
    expect(items.map((o) => o.getAttribute('data-view'))).toEqual(['', 'e1', 'e2']);
    expect(items[1].querySelector('.fb-view-count').textContent).toBe('3'); // A, B + C (secondary)
    expect(items[2].querySelector('.fb-view-count').textContent).toBe('1');
    expect(document.querySelector('.fb-legend')).toBeNull();
    expect(document.querySelector('.fb-view-kind').textContent).toBe('Epic');
  });

  it('secondary epics show as dots in the screen header', () => {
    const dots = state.screenEls.C.querySelectorAll('.fb-epic-dot');
    expect(dots.length).toBe(1);
    expect(state.screenEls.A.querySelectorAll('.fb-epic-dot').length).toBe(0);
  });

  it('focusing an epic shows its screens (incl. multi-epic ones), numbered, real positions kept', () => {
    setFocus('e1');
    expect(state.screenEls.C.classList.contains('fb-focus-out')).toBe(false); // C is also in e1
    setFocus('e2');
    expect(state.screenEls.A.classList.contains('fb-focus-out')).toBe(true);
    expect(state.screenEls.C.querySelector('.fb-step-badge').textContent).toBe('1');
    expect(persistedPositions().A).toEqual({ x: 10, y: 10 });
    commit();
    expect(loadDoc()).toContain(':A, t=A, e=e1, x=10, y=10');
  });

  it('only draws arrows between visible screens while focused', () => {
    setFocus('e2');
    expect(document.querySelectorAll('.fb-arrow-group').length).toBe(0); // C alone
    setFocus('e1');
    expect(document.querySelectorAll('.fb-arrow-group').length).toBe(3);
  });

  it('exitFocus restores the real positions and shows every screen', () => {
    setFocus('e2');
    exitFocus();
    expect(state.focus).toBeNull();
    expect(state.positions.A).toEqual({ x: 10, y: 10 });
    expect(state.screenEls.A.classList.contains('fb-focus-out')).toBe(false);
    expect(document.querySelectorAll('.fb-step-badge').length).toBe(0);
  });

  it('picking an item focuses it; the clear chip goes back to all screens', () => {
    document.querySelector('[data-testid="view-btn"]').click();
    expect(document.querySelector('.fb-view').classList.contains('fb-open')).toBe(true);
    document.querySelector('.fb-view-item[data-view="e2"]').click();
    expect(state.focus.id).toBe('e2');
    expect(document.querySelector('.fb-view-label').textContent).toBe('E2');
    document.querySelector('[data-testid="view-clear"]').click();
    expect(state.focus).toBeNull();
    expect(document.querySelector('.fb-view-label').textContent).toBe('All screens');
  });

  it('keyboard: ArrowDown + Enter picks the next item; Escape closes', () => {
    const btn = document.querySelector('[data-testid="view-btn"]');
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(state.focus.id).toBe('e1');
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.fb-view').classList.contains('fb-open')).toBe(false);
  });

  it('toggleScreenEpic adds / removes an epic; setScreenEpic resets to one', () => {
    toggleScreenEpic('A', 'e2');
    const a = state.project.screens.find((s) => s.id === 'A');
    expect(screenEpics(a)).toEqual(['e1', 'e2']);
    expect(state.screenEls.A.querySelectorAll('.fb-epic-dot').length).toBe(1);
    expect(loadDoc()).toContain(':A, t=A, e="e1 e2"');
    toggleScreenEpic('A', 'e1'); // remove the primary → e2 becomes primary
    expect(a.epic).toBe('e2');
    expect(a.epics).toBeUndefined();
    setScreenEpic('A', 'e1');
    expect(screenEpics(a)).toEqual(['e1']);
  });

  it('deleteEpic removes it from multi-epic screens too', () => {
    window.confirm = () => true;
    deleteEpic('e1');
    const c = state.project.screens.find((s) => s.id === 'C');
    expect(screenEpics(c)).toEqual(['e2']);
    expect(state.screenEls.C.querySelectorAll('.fb-epic-dot').length).toBe(0);
  });

  it('draws kind classes and hides nav arrows when toggled off', () => {
    drawArrows();
    expect(document.querySelectorAll('.fb-arrow-main').length).toBe(1);
    expect(document.querySelectorAll('.fb-arrow-nav').length).toBe(1);
    const toggle = document.querySelector('[data-testid="toggle-nav"]');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('.fb-arrow-nav').length).toBe(0);
  });

  it('hover emphasis only marks the hovered screen arrows', () => {
    drawArrows();
    state.screenEls.B.dispatchEvent(new MouseEvent('mouseenter'));
    const hl = Array.from(document.querySelectorAll('.fb-arrow-hl')).map((g) => g.getAttribute('data-from') + g.getAttribute('data-to'));
    expect(hl.sort()).toEqual(['AB', 'BC']);
    state.screenEls.B.dispatchEvent(new MouseEvent('mouseleave'));
    expect(document.querySelectorAll('.fb-arrow-hl').length).toBe(0);
  });

  it('cycleArrowKind goes default → main → nav → default', () => {
    cycleArrowKind(2);
    expect(state.project.arrows[2].kind).toBe('main');
    cycleArrowKind(2);
    expect(state.project.arrows[2].kind).toBe('nav');
    cycleArrowKind(2);
    expect(state.project.arrows[2].kind).toBeUndefined();
  });
});

describe('arrow detail card', () => {
  it('round-trips detail + note through Flow-ML', () => {
    const project = { epics: [], screens: [{ id: 'a' }, { id: 'b' }], arrows: [{ from: 'a', to: 'b', label: 'Clôturer', kind: 'main', detail: 'POST /v1/update · UPDATE_CLOTURE', note: 'heure de départ + compte rendu' }] };
    const out = serialize(project, {});
    expect(out).toContain('a -> b, l=Clôturer, k=main, d="POST /v1/update · UPDATE_CLOTURE", n="heure de départ + compte rendu"');
    expect(parse(out).project.arrows[0]).toEqual(project.arrows[0]);
  });

  it('draws a card (code chip) for an arrow with detail, a plain label otherwise', () => {
    document.body.innerHTML = '<div id="app"></div>';
    try { window.localStorage.clear(); } catch (e) {}
    state.focus = null; state.selected = {}; state.hiddenScreens = {}; state.screenEls = {};
    init({
      container: document.getElementById('app'),
      project: { name: 'ApiTest', epics: [], screens: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
        arrows: [{ from: 'A', to: 'B', label: 'go', detail: 'GET /x', note: 'renvoie x' }, { from: 'B', to: 'C', label: 'plain' }] },
      state: { positions: { A: { x: 0, y: 0 }, B: { x: 600, y: 0 }, C: { x: 1200, y: 0 } } },
    });
    drawArrows();
    const cards = document.querySelectorAll('.fb-arrow-card');
    expect(cards.length).toBe(1);
    expect(cards[0].querySelector('.fb-arrow-detail').textContent).toBe('GET /x');
    expect(cards[0].querySelector('.fb-arrow-note').textContent).toBe('renvoie x');
    expect(document.querySelectorAll('.fb-arrow-label-group').length).toBe(2);
  });
});

describe('arrow color + adaptive gaps', () => {
  it('round-trips color through Flow-ML and tints the card', () => {
    const project = { epics: [], screens: [{ id: 'a' }, { id: 'b' }], arrows: [{ from: 'a', to: 'b', label: 'x', detail: 'GET /x', color: 'amber' }] };
    const out = serialize(project, {});
    expect(out).toContain('a -> b, l=x, d="GET /x", c=amber');
    expect(parse(out).project.arrows[0]).toEqual(project.arrows[0]);
    document.body.innerHTML = '<div id="app"></div>';
    try { window.localStorage.clear(); } catch (e) {}
    state.focus = null; state.selected = {}; state.hiddenScreens = {}; state.screenEls = {};
    init({ container: document.getElementById('app'), project: { name: 'ColorTest', ...project }, state: { positions: { a: { x: 0, y: 0 }, b: { x: 700, y: 0 } } } });
    drawArrows();
    const bg = document.querySelector('.fb-arrow-card .fb-arrow-label-bg');
    expect(bg.getAttribute('stroke')).toBe('#d97706');
    expect(bg.getAttribute('fill')).toBe('#fff4d6');
  });

  it('Flow layout widens the gap between two columns when a card must fit between them', () => {
    const screens = [{ id: 'a', size: 'md' }, { id: 'b', size: 'md' }];
    const plain = autoLayout(screens, [{ from: 'a', to: 'b' }]);
    const card = autoLayout(screens, [{ from: 'a', to: 'b', label: 'Clôturer', detail: 'POST /v1/update/une/route/vraiment/tres/longue/sans/espace' }]);
    expect(plain.b.x - plain.a.x).toBe(320 + GAP_X);
    expect(card.b.x - card.a.x).toBeGreaterThan(320 + GAP_X);
  });

  it('Epics layout widens the vertical gap between rows for a card on a cross-row arrow', () => {
    const screens = [{ id: 'a', epic: 'e1', size: 'md' }, { id: 'b', epic: 'e2', size: 'md' }];
    const plain = layoutByEpics(screens, [{ from: 'a', to: 'b' }], { a: 100, b: 100 });
    const card = layoutByEpics(screens, [{ from: 'a', to: 'b', label: 'Une action avec un long libellé qui se replie', detail: 'POST /v1/update · UPDATE_CLOTURE · UPDATE_HISTO · UPDATE_DOCUMENT · UPDATE_ARRIVEESITE', note: 'heure de départ, compte rendu, signatures technicien et client, photos annotées, consommables, retour matériel' }], { a: 100, b: 100 });
    // Same column, adjacent rows: the full card height is reserved.
    expect(card.b.y - card.a.y).toBeGreaterThan(plain.b.y - plain.a.y);
  });
});

describe('true grid, spacing, export scope', () => {
  it('Flow lays columns on a true grid: rows aligned across columns, top-anchored', () => {
    const screens = [{ id: 'r', size: 'md' }, { id: 'a', size: 'md' }, { id: 'b', size: 'md' }, { id: 'c', size: 'md' }];
    const arrows = [{ from: 'r', to: 'a' }, { from: 'r', to: 'b' }, { from: 'r', to: 'c' }];
    const pos = autoLayout(screens, arrows, { r: 100, a: 100, b: 100, c: 100 });
    expect(pos.r.y).toBe(pos.a.y);            // first row aligned (no centering stagger)
    expect(pos.a.x).toBe(pos.b.x);
    expect(pos.b.y - pos.a.y).toBe(100 + GAP_Y);
  });

  it('Grid groups screens by epic and wraps after ceil(sqrt(n))', () => {
    state.project = { epics: [{ id: 'e1' }, { id: 'e2' }], screens: [], arrows: [] };
    const screens = [{ id: 'a', epic: 'e2', size: 'md' }, { id: 'b', epic: 'e1', size: 'md' }, { id: 'c', epic: 'e1', size: 'md' }, { id: 'd', epic: 'e2', size: 'md' }];
    const pos = layoutGrid(screens, [], {});
    expect(pos.b.y).toBe(pos.c.y);            // e1 pair on the first row
    expect(pos.b.x).toBeLessThan(pos.c.x);
    expect(pos.a.y).toBeGreaterThan(pos.b.y); // e2 on the second row
    state.project = null;
  });

  it('spreadPositions scales every gap from the top-left corner', () => {
    const pos = spreadPositions({ a: { x: 100, y: 100 }, b: { x: 600, y: 100 }, c: { x: 100, y: 800 } }, 1.2);
    expect(pos.a).toEqual({ x: 100, y: 100 });
    expect(pos.b).toEqual({ x: 700, y: 100 });
    expect(pos.c).toEqual({ x: 100, y: 940 });
  });

  it('the spacing buttons spread the current positions and persist', () => {
    document.body.innerHTML = '<div id="app"></div>';
    try { window.localStorage.clear(); } catch (e) {}
    state.focus = null; state.selected = {}; state.hiddenScreens = {}; state.screenEls = {}; state.spacing = 1;
    init({ container: document.getElementById('app'), project: { name: 'SpaceTest', epics: [], screens: [{ id: 'A' }, { id: 'B' }], arrows: [{ from: 'A', to: 'B' }] },
      state: { positions: { A: { x: 100, y: 100 }, B: { x: 600, y: 100 } } } });
    // jsdom: no layout → no viewport origin → scaled from the top-left corner (A stays put).
    const zoom = state.zoom, panX = state.panX, panY = state.panY;
    document.querySelector('[data-testid="spacing-plus"]').click();
    expect(state.positions.A.x).toBe(100);
    expect(state.positions.B.x).toBe(700);
    expect(state.spacing).toBeCloseTo(1.2);
    expect(loadDoc()).toContain('x=700');
    // The view must not jump: zoom and pan are untouched.
    expect([state.zoom, state.panX, state.panY]).toEqual([zoom, panX, panY]);
    document.querySelector('[data-testid="spacing-minus"]').click();
    expect(state.positions.B.x).toBe(600);
  });

  it('spreading past the canvas edge shifts the screens back in and pans by the same amount', () => {
    document.body.innerHTML = '<div id="app"></div>';
    try { window.localStorage.clear(); } catch (e) {}
    state.focus = null; state.selected = {}; state.hiddenScreens = {}; state.screenEls = {}; state.spacing = 1;
    init({ container: document.getElementById('app'), project: { name: 'EdgeTest', epics: [], screens: [{ id: 'A' }, { id: 'B' }], arrows: [] },
      state: { positions: { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }, zoom: 1, panX: 0, panY: 0 } });
    state.wrapperEl.getBoundingClientRect = () => ({ width: 1000, height: 800, left: 0, top: 0, right: 1000, bottom: 800 });
    document.querySelector('[data-testid="spacing-plus"]').click();
    // Scaled around (500, 400): A would land at x=-100 → shifted to the 40px margin, pan compensates.
    expect(state.positions.A.x).toBe(40);
    expect(state.positions.B.x).toBe(640);
    expect(state.panX).toBe(-140);
  });

  it('export bounds only cover the focused epic', () => {
    document.body.innerHTML = '<div id="app"></div>';
    try { window.localStorage.clear(); } catch (e) {}
    state.focus = null; state.selected = {}; state.hiddenScreens = {}; state.screenEls = {}; state.spacing = 1;
    init({ container: document.getElementById('app'), project: { name: 'ExportTest', epics: [{ id: 'e1', label: 'E1', color: '#f00' }, { id: 'e2', label: 'E2', color: '#0f0' }],
      screens: [{ id: 'A', epic: 'e1' }, { id: 'B', epic: 'e1' }, { id: 'Z', epic: 'e2' }], arrows: [{ from: 'A', to: 'B' }, { from: 'B', to: 'Z' }] },
      state: { positions: { A: { x: 0, y: 0 }, B: { x: 500, y: 0 }, Z: { x: 5000, y: 5000 } } } });
    drawArrows();
    const all = collectExportBounds();
    expect(all.maxX).toBeGreaterThanOrEqual(5000);
    setFocus('e1');
    drawArrows();
    expect(isScreenShown('Z')).toBe(false);
    const focused = collectExportBounds();
    // Only A and B (re-laid out by the focus) count: the bounds match their boxes.
    const xs = ['A', 'B'].map((id) => state.positions[id].x + state.screenEls[id].offsetWidth);
    expect(focused.maxX).toBeLessThanOrEqual(Math.max.apply(null, xs) + 1);
    exitFocus();
  });
});

describe('stale saved view', () => {
  it('isContentInView is false when the viewport shows no screen, true otherwise', () => {
    document.body.innerHTML = '<div id="app"></div>';
    try { window.localStorage.clear(); } catch (e) {}
    state.focus = null; state.selected = {}; state.hiddenScreens = {}; state.screenEls = {}; state.spacing = 1;
    init({ container: document.getElementById('app'), project: { name: 'ViewTest', epics: [], screens: [{ id: 'A' }], arrows: [] },
      state: { positions: { A: { x: 100, y: 100 } }, zoom: 1, panX: 0, panY: 0 } });
    // jsdom has no layout: stub the wrapper size and the screen size.
    state.wrapperEl.getBoundingClientRect = () => ({ width: 1000, height: 800, left: 0, top: 0, right: 1000, bottom: 800 });
    Object.defineProperty(state.screenEls.A, 'offsetWidth', { value: 260 });
    Object.defineProperty(state.screenEls.A, 'offsetHeight', { value: 480 });
    expect(isContentInView()).toBe(true);
    state.panX = -5000; state.panY = -5000; // looking at an empty area
    expect(isContentInView()).toBe(false);
  });
});

describe('spreadPositions around an origin', () => {
  it('keeps the origin point fixed', () => {
    const pos = spreadPositions({ a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } }, 2, { x: 500, y: 0 });
    expect(pos.a.x).toBe(-500);
    expect(pos.b.x).toBe(1500);
  });
});
