import { describe, it, expect, beforeEach, vi } from 'vitest';
import { init, doReset } from './src/board';
import { state } from './src/core/state';
import { showContextMenu, closeContextMenu } from './src/render/context-menu';
import { createScreen } from './src/interactions/create';
import { setScreenPreset, setScreenFormat, toggleScreen, deleteScreen } from './src/render/screen';
import { closePresetPicker } from './src/render/preset-picker';
import { rebuildBoard, commit } from './src/interactions/sync';
import { parse } from './src/flowml/parse';
import { loadDoc } from './src/core/storage';

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

describe('preset create + modify', () => {
  beforeEach(() => { closeContextMenu(); closePresetPicker(); initBoard(); });

  it('right-click → "Créer un écran" → preset picker (preview grid)', () => {
    state.wrapperEl.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }));
    const menu = document.querySelector('.fb-ctx-menu');
    expect(menu).toBeTruthy();
    expect(menu.textContent).toContain('Créer un écran');
    menu.querySelector('.fb-ctx-item').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const picker = document.querySelector('.fb-preset-picker');
    expect(picker).toBeTruthy();
    expect(picker.querySelectorAll('.fb-preset-tile').length).toBe(15); // 14 presets + custom
    expect(picker.textContent.trim()).toBe(''); // no preset labels (previews only)
  });

  it('createScreen adds a positioned preset screen and renders its skeleton', () => {
    const before = state.project.screens.length;
    const id = createScreen('form', 40, 60);
    expect(state.project.screens.length).toBe(before + 1);
    const s = state.project.screens.find((x) => x.id === id);
    expect(s.preset).toBe('form');
    expect(s.title).toBe('Écran ' + id.replace('screen-', '')); // title number aligns with id
    expect(state.positions[id]).toBeTruthy();
    expect(state.screenEls[id].querySelector('.fb-skel-form')).toBeTruthy();
  });

  it('created ids are unique', () => {
    expect(createScreen('list', 0, 0)).not.toBe(createScreen('list', 0, 0));
  });

  it('setScreenPreset swaps the body but keeps content in data (reversible)', () => {
    const sA = state.project.screens.find((x) => x.id === 'A');
    sA.content = '<b>hello</b>';
    setScreenPreset('A', 'dashboard');
    expect(sA.preset).toBe('dashboard');
    expect(state.screenEls['A'].querySelector('.fb-screen-body').classList.contains('fb-skel-dashboard')).toBe(true);
    expect(sA.content).toBe('<b>hello</b>'); // non-destructive
    setScreenPreset('A', 'custom'); // back to custom restores the HTML
    expect(state.screenEls['A'].querySelector('.fb-screen-body').innerHTML).toBe('<b>hello</b>');
  });

  it('created screens default to the desktop format', () => {
    const id = createScreen('blank', 0, 0);
    const s = state.project.screens.find((x) => x.id === id);
    expect(s.format).toBe('desktop');
    expect(state.screenEls[id].style.width).toBe('400px');
    expect(state.screenEls[id].style.height).toBe('240px');
  });

  it('setScreenFormat applies the format dimensions', () => {
    setScreenFormat('A', 'phone');
    const sA = state.project.screens.find((x) => x.id === 'A');
    expect(sA.format).toBe('phone');
    expect(state.screenEls['A'].style.width).toBe('240px');
    expect(state.screenEls['A'].style.height).toBe('420px');
  });

  it('the screen popup offers the 3 device formats', () => {
    state.screenEls['A'].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 30 }));
    const btns = state.container.querySelectorAll('.fb-screen-popup-format');
    expect(btns.length).toBe(3);
    expect(Array.prototype.map.call(btns, (b) => b.textContent)).toEqual(['Desktop', 'Phone', 'Fluide']);
  });

  it('a mousedown inside the popup does not start a pan that closes it', () => {
    state.screenEls['A'].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 30 }));
    const fmtBtn = state.container.querySelector('.fb-screen-popup-format');
    fmtBtn.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(state.panDrag).toBeFalsy(); // pan handler excluded the popup
    expect(state.container.querySelector('.fb-screen-popup')).toBeTruthy(); // popup still open
  });

  it('the popup "Modifier le layout" button opens the preset picker', () => {
    state.screenEls['A'].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 30 }));
    const btns = state.container.querySelectorAll('.fb-screen-popup-btn');
    const layoutBtn = Array.prototype.find.call(btns, (b) => b.textContent === 'Modifier le layout');
    expect(layoutBtn).toBeTruthy();
    layoutBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 40, clientY: 40 }));
    expect(document.querySelector('.fb-preset-picker')).toBeTruthy();
  });
});

describe('Flow-ML panel + sync', () => {
  beforeEach(() => { initBoard(); });

  it('renders the panel filled with the board as Flow-ML', () => {
    expect(document.querySelector('.fb-panel')).toBeTruthy();
    const text = state.panelTextarea.value;
    expect(text).toContain('@e1'); // epic
    expect(text).toContain('A,'); // screen A
  });

  it('the collapse button toggles the panel', () => {
    document.querySelector('.fb-panel-collapse').click();
    expect(document.querySelector('.fb-panel').classList.contains('fb-panel-collapsed')).toBe(true);
  });

  it('the gutter has one line number per Flow-ML line', () => {
    const lines = state.panelTextarea.value.split('\n').length;
    const gutter = document.querySelector('.fb-panel-gutter').textContent.split('\n');
    expect(gutter.length).toBe(lines);
    expect(gutter[0]).toBe('1');
  });

  it('renders a syntax-highlighted layer behind the textarea', () => {
    const code = document.querySelector('.fb-panel-highlight code');
    expect(code).toBeTruthy();
    expect(code.querySelector('.fb-tok-screen')).toBeTruthy(); // screen A is colored
    expect(code.querySelector('.fb-tok-epic')).toBeTruthy();   // epic @e1 is colored
  });

  it('the ? button toggles the color-coded cheat-sheet', () => {
    document.querySelector('.fb-panel-help-btn').click();
    expect(document.querySelector('.fb-panel').classList.contains('fb-help-open')).toBe(true);
    expect(document.querySelector('.fb-panel-help .fb-tok-screen')).toBeTruthy();
  });

  it('text → diagram: rebuildBoard renders screens from a parsed model', () => {
    const { project, positions } = parse('x1, t=One\nx2, t=Two\nx1 -> x2\n');
    rebuildBoard(project, positions);
    expect(Object.keys(state.screenEls).sort()).toEqual(['x1', 'x2']);
    expect(state.canvasEl.querySelectorAll('.fb-screen').length).toBe(2);
  });

  it('diagram → text: a mutation re-serializes into the panel', () => {
    setScreenFormat('A', 'phone'); // routes through commit()
    expect(state.panelTextarea.value).toContain('f=phone');
  });

  it('anti-loop: commit is a no-op while syncing', () => {
    state.panelTextarea.value = 'SENTINEL';
    state.syncing = true;
    commit();
    expect(state.panelTextarea.value).toBe('SENTINEL'); // not overwritten
    state.syncing = false;
  });

  it('persists to Flow-ML and reloads from it (source of truth)', () => {
    const id = createScreen('blank', 200, 200); // → commit → saveDoc
    expect(loadDoc()).toContain(id);
    // Re-init WITHOUT clearing localStorage (same project name) → loads the doc,
    // even though the passed config has no screens.
    document.body.innerHTML = '<div id="app"></div>';
    init({ container: document.getElementById('app'), project: { name: 'Smoke', epics: [], screens: [], arrows: [] } });
    expect(state.project.screens.some((s) => s.id === id)).toBe(true);
  });
});

describe('Flow-ML sync hardening', () => {
  beforeEach(() => { initBoard(); });

  function typePanel(text) {
    state.panelTextarea.value = text;
    state.panelTextarea.dispatchEvent(new window.Event('input', { bubbles: true }));
  }

  it('an emptied / whitespace panel does not wipe the board', () => {
    vi.useFakeTimers();
    typePanel('   ');
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    expect(state.canvasEl.querySelectorAll('.fb-screen').length).toBe(3); // A,B,C intact
  });

  it('editing !name keeps writing to the original (pinned) storage key', () => {
    vi.useFakeTimers();
    typePanel('!name = Renamed\nA, t=A\n');
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    expect(loadDoc()).toContain('Renamed');                              // pinned key fb-Smoke
    expect(window.localStorage.getItem('fb-Renamed-flowml')).toBeNull(); // no orphan key
  });

  it('changing epics in the text rebuilds the toolbar legend', () => {
    const { project, positions } = parse('@e2, t=New, c=#0f0\nx1, t=One, e=e2\n');
    state.syncing = true; rebuildBoard(project, positions); state.syncing = false;
    expect(document.querySelector('.fb-legend-checkbox[data-epic-id="e2"]')).toBeTruthy();
    expect(document.querySelector('.fb-legend-checkbox[data-epic-id="e1"]')).toBeFalsy();
  });

  it('rebuild prunes selection entries for deleted screens', () => {
    state.selected = { A: true, GONE: true };
    const { project, positions } = parse('A, t=A\n');
    state.syncing = true; rebuildBoard(project, positions); state.syncing = false;
    expect(state.selected.GONE).toBeUndefined();
  });

  it('an explicit config.state wins over a saved doc', () => {
    createScreen('blank', 100, 100); // saves a doc under fb-Smoke
    document.body.innerHTML = '<div id="app"></div>';
    init({
      container: document.getElementById('app'),
      project: { name: 'Smoke', epics: [], screens: [{ id: 'Z', title: 'Z' }], arrows: [] },
      state: { positions: { Z: { x: 10, y: 10 } }, hiddenScreens: {}, arrows: [] },
    });
    expect(state.project.screens.map((s) => s.id)).toEqual(['Z']);
  });

  it('Reset clears visibility and re-serializes, keeping screens from the text', () => {
    window.confirm = () => true;
    toggleScreen('A');
    expect(state.hiddenScreens.A).toBe(true);
    doReset();
    expect(state.hiddenScreens.A).toBeFalsy();
    expect(loadDoc()).toContain('A,'); // committed, screens preserved
  });
});

describe('Flow-ML UX additions', () => {
  beforeEach(() => { initBoard(); });

  it('deleteScreen removes the screen, its arrows, and re-serializes', () => {
    state.project.arrows = [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }];
    deleteScreen('A');
    expect(state.screenEls.A).toBeUndefined();
    expect(state.project.screens.some((s) => s.id === 'A')).toBe(false);
    expect(state.project.arrows).toEqual([{ from: 'B', to: 'C' }]); // A->B dropped
    expect(loadDoc()).not.toContain('\nA,');
  });

  it('the Copy Init toolbar button is gone', () => {
    const labels = [...document.querySelectorAll('.fb-action-btn')].map((b) => b.textContent);
    expect(labels).not.toContain('Copy Init');
  });

  it('the fluid format sets a min size (not a fixed width)', () => {
    setScreenFormat('A', 'fluid');
    const el = state.screenEls.A;
    expect(el.style.minWidth).toBe('280px');
    expect(el.style.minHeight).toBe('180px');
    expect(el.style.width).toBe('');
    expect(state.panelTextarea.value).toContain('f=fluid');
  });

  it('the panel copy button writes the doc to the clipboard', async () => {
    let captured = null;
    const orig = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t) => { captured = t; return Promise.resolve(); } }, configurable: true,
    });
    document.querySelector('.fb-panel-copy-btn').click();
    await Promise.resolve();
    expect(captured).toBe(state.panelTextarea.value);
    Object.defineProperty(navigator, 'clipboard', { value: orig, configurable: true });
  });

  it('the active-line indicator follows the caret line', () => {
    const ta = state.panelTextarea;
    const band = document.querySelector('.fb-panel-activeline');
    ta.selectionStart = 0;
    ta.dispatchEvent(new window.KeyboardEvent('keyup', { bubbles: true }));
    expect(band.style.top).toBe('12px');
    ta.selectionStart = ta.value.indexOf('\n') + 1; // start of line 2
    ta.dispatchEvent(new window.KeyboardEvent('keyup', { bubbles: true }));
    expect(band.style.top).toBe('33.25px'); // 12 + 1 × 21.25
  });
});
