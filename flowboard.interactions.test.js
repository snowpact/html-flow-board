import { describe, it, expect, beforeEach } from 'vitest';
import { init } from './src/board';
import { state } from './src/core/state';
import { showContextMenu, closeContextMenu } from './src/render/context-menu';

// Modules are imported directly and share one `state` singleton, so reset it
// between tests (init repopulates most of it, but not every transient field).
function resetState() {
  state.zoom = 1; state.panX = 0; state.panY = 0;
  state.mode = 'drag'; state.selected = {}; state.selectBox = null; state.screenDrag = null;
  state.pointerInBoard = false; state._dotZoom = null;
  state.project = null; state.positions = {}; state.defaultPositions = {};
  state.screenEls = {}; state.hiddenEpics = {}; state.hiddenScreens = {};
  state.showNotes = true; state.layoutIndex = 0;
  state.creatingArrow = null; state.draggingHandle = null; state.panDrag = null;
}

function initBoard() {
  document.body.innerHTML = '<div id="app"></div>';
  try { window.localStorage.clear(); } catch (e) {}
  // jsdom has no layout engine: stub elementFromPoint (used by the drag
  // mouseup to re-show anchor dots) so it returns nothing instead of throwing.
  if (!document.elementFromPoint) document.elementFromPoint = function () { return null; };
  resetState();
  init({
    container: document.getElementById('app'),
    project: {
      name: 'Smoke',
      epics: [{ id: 'e1', label: 'E', color: '#f00' }],
      screens: [
        { id: 'A', title: 'A', epic: 'e1' },
        { id: 'B', title: 'B', epic: 'e1' },
        { id: 'C', title: 'C', epic: 'e1' },
      ],
      arrows: [],
    },
  });
}

function mdown(el, opts) {
  el.dispatchEvent(new window.MouseEvent('mousedown', Object.assign({ bubbles: true, cancelable: true, button: 0 }, opts)));
}
function mmove(opts) {
  document.dispatchEvent(new window.MouseEvent('mousemove', Object.assign({ bubbles: true }, opts)));
}
function mup(opts) {
  document.dispatchEvent(new window.MouseEvent('mouseup', Object.assign({ bubbles: true, button: 0 }, opts)));
}
function keydown(key) {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: key, bubbles: true }));
}
function enterBoard() {
  state.wrapperEl.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: false }));
}
function selectMode() { document.querySelector('.fb-mode-btn[data-mode="select"]').click(); }
function dragMode() { document.querySelector('.fb-mode-btn[data-mode="drag"]').click(); }

describe('mode switch + selection', () => {
  beforeEach(() => { initBoard(); });

  it('renders the mode switch, drag active by default', () => {
    const sw = document.querySelector('.fb-mode-switch');
    expect(sw).toBeTruthy();
    expect(sw.querySelectorAll('.fb-mode-btn').length).toBe(2);
    expect(state.mode).toBe('drag');
    expect(state.wrapperEl.classList.contains('fb-mode-drag')).toBe(true);
    expect(sw.querySelector('.fb-mode-btn.active').dataset.mode).toBe('drag');
  });

  it('switches mode via button and keyboard', () => {
    selectMode();
    expect(state.mode).toBe('select');
    expect(state.wrapperEl.classList.contains('fb-mode-select')).toBe(true);
    enterBoard(); // shortcuts only fire while hovering the board
    keydown('h');
    expect(state.mode).toBe('drag');
    keydown('v');
    expect(state.mode).toBe('select');
  });

  it('keyboard shortcuts are ignored when the pointer is not over the board', () => {
    // pointer never entered the board
    keydown('v');
    expect(state.mode).toBe('drag');
  });

  it('click selects a screen in select mode', () => {
    selectMode();
    mdown(state.screenEls['A']); mup();
    expect(state.selected).toEqual({ A: true });
    expect(state.screenEls['A'].classList.contains('fb-selected')).toBe(true);
  });

  it('applies the selected class on mousedown, before mouseup (instant, no delay)', () => {
    selectMode();
    mdown(state.screenEls['A']); // button still held, no mouseup yet
    expect(state.screenEls['A'].classList.contains('fb-selected')).toBe(true);
    expect(state.selected).toEqual({ A: true });
    mup();
  });

  it('cmd+click adds to the selection', () => {
    selectMode();
    mdown(state.screenEls['A']); mup();
    mdown(state.screenEls['B'], { metaKey: true }); mup();
    expect(state.selected).toEqual({ A: true, B: true });
  });

  it('cmd+click again removes from the selection', () => {
    selectMode();
    mdown(state.screenEls['A']); mup();
    mdown(state.screenEls['B'], { metaKey: true }); mup();
    mdown(state.screenEls['A'], { metaKey: true }); mup();
    expect(state.selected).toEqual({ B: true });
  });

  it('plain click on another screen collapses selection to that one', () => {
    selectMode();
    mdown(state.screenEls['A']); mup();
    mdown(state.screenEls['B'], { metaKey: true }); mup();
    mdown(state.screenEls['C']); mup();
    expect(state.selected).toEqual({ C: true });
  });

  it('switching to drag mode clears the selection', () => {
    selectMode();
    mdown(state.screenEls['A']); mup();
    expect(state.selected).toEqual({ A: true });
    dragMode();
    expect(state.selected).toEqual({});
    expect(state.screenEls['A'].classList.contains('fb-selected')).toBe(false);
  });

  it('Escape clears the selection in select mode', () => {
    selectMode();
    mdown(state.screenEls['A']); mup();
    enterBoard();
    keydown('Escape');
    expect(state.selected).toEqual({});
  });

  it('group move: dragging a selected screen moves the whole selection by the same delta', () => {
    selectMode();
    mdown(state.screenEls['A']); mup();
    mdown(state.screenEls['B'], { metaKey: true }); mup();
    const ax = state.positions['A'].x, ay = state.positions['A'].y;
    const bx = state.positions['B'].x, by = state.positions['B'].y;
    mdown(state.screenEls['A'], { clientX: 0, clientY: 0 });
    mmove({ clientX: 50, clientY: 30 });
    mup();
    expect(state.positions['A'].x).toBeCloseTo(ax + 50);
    expect(state.positions['A'].y).toBeCloseTo(ay + 30);
    expect(state.positions['B'].x).toBeCloseTo(bx + 50);
    expect(state.positions['B'].y).toBeCloseTo(by + 30);
  });

  it('in drag mode, dragging a screen moves only that screen (no selection)', () => {
    // drag mode is default
    const bx = state.positions['B'].x;
    mdown(state.screenEls['A'], { clientX: 0, clientY: 0 });
    mmove({ clientX: 40, clientY: 0 });
    mup();
    expect(state.positions['A'].x).toBeCloseTo(state.defaultPositions['A'].x + 40);
    expect(state.positions['B'].x).toBeCloseTo(bx); // untouched
    expect(state.selected).toEqual({});
  });

  it('group move clamps as a rigid block at the canvas edge (preserves spacing)', () => {
    selectMode();
    mdown(state.screenEls['A']); mup();
    mdown(state.screenEls['B'], { metaKey: true }); mup();
    state.positions['A'] = { x: 100, y: 100 };
    state.positions['B'] = { x: 500, y: 100 };
    // Drag left by 300; A would hit 0 first. The group must move as one unit
    // (dx clamped to -100), keeping the 400px gap intact.
    mdown(state.screenEls['A'], { clientX: 0, clientY: 0 });
    mmove({ clientX: -300, clientY: 0 });
    mup();
    expect(state.positions['A'].x).toBeCloseTo(0);
    expect(state.positions['B'].x).toBeCloseTo(400);
  });

  it('plain click on empty background clears the selection', () => {
    selectMode();
    mdown(state.screenEls['A']); mup();
    mdown(state.wrapperEl); mup();
    expect(state.selected).toEqual({});
  });

  it('modifier+click on empty background does not clear the selection', () => {
    selectMode();
    mdown(state.screenEls['A']); mup();
    expect(state.selected).toEqual({ A: true });
    mdown(state.wrapperEl, { metaKey: true }); mup();
    expect(state.selected).toEqual({ A: true });
  });

  it('hiding a screen removes it from the selection', () => {
    selectMode();
    mdown(state.screenEls['A']); mup();
    expect(state.selected).toEqual({ A: true });
    const cb = state.container.querySelector('.fb-legend-checkbox[data-epic-id="e1"]');
    cb.checked = false;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(state.hiddenScreens['A']).toBe(true);
    expect(state.selected['A']).toBeUndefined();
    expect(state.screenEls['A'].classList.contains('fb-selected')).toBe(false);
  });

  it('reset clears the selection', () => {
    window.confirm = function () { return true; };
    selectMode();
    mdown(state.screenEls['A']); mup();
    const btns = state.container.querySelectorAll('.fb-action-btn');
    const resetBtn = Array.prototype.find.call(btns, function (b) { return b.textContent === 'Reset'; });
    resetBtn.click();
    expect(state.selected).toEqual({});
    expect(state.screenEls['A'].classList.contains('fb-selected')).toBe(false);
  });

  it('keeps the dotted grid a constant on-screen size across zoom (counter-scaled)', () => {
    const canvas = state.canvasEl;
    const sizePx = () => parseFloat(canvas.style.backgroundSize);
    // Invariant: rendered spacing = backgroundSize * zoom must not change with zoom.
    const onScreen = sizePx() * state.zoom;
    expect(onScreen).toBeGreaterThan(0);
    const zoomIn = state.container.querySelector('.fb-toolbar-btn[title="Zoom in"]');
    zoomIn.click();
    zoomIn.click();
    expect(state.zoom).toBeGreaterThan(1);
    expect(sizePx() * state.zoom).toBeCloseTo(onScreen);
  });
});

describe('context menu', () => {
  beforeEach(() => { document.body.innerHTML = ''; closeContextMenu(); });

  it('renders a menu at the given position', () => {
    showContextMenu(10, 20, [{ label: 'A' }, { label: 'B' }]);
    const menu = document.querySelector('.fb-ctx-menu');
    expect(menu).toBeTruthy();
    expect(menu.querySelectorAll('.fb-ctx-item').length).toBe(2);
  });

  it('clicking a leaf item runs onClick and closes the menu', () => {
    let clicked = false;
    showContextMenu(0, 0, [{ label: 'Go', onClick: () => { clicked = true; } }]);
    document.querySelector('.fb-ctx-item').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(clicked).toBe(true);
    expect(document.querySelector('.fb-ctx-menu')).toBeNull();
  });

  it('a submenu item reveals its children on hover', () => {
    showContextMenu(0, 0, [{ label: 'Créer', submenu: [{ label: 'form' }, { label: 'list' }] }]);
    const item = document.querySelector('.fb-ctx-item.fb-ctx-has-sub');
    expect(item).toBeTruthy();
    item.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: false }));
    const sub = item.querySelector('.fb-ctx-sub');
    expect(sub).toBeTruthy();
    expect(sub.querySelectorAll('.fb-ctx-item').length).toBe(2);
  });

  it('showing a new menu closes the previous one', () => {
    showContextMenu(0, 0, [{ label: 'A' }]);
    showContextMenu(0, 0, [{ label: 'B' }]);
    expect(document.querySelectorAll('.fb-ctx-menu').length).toBe(1);
  });
});
