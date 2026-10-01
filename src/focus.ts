import { drawArrows } from './arrows';
import { getEpic, inEpic, state } from './core/state';
import { Arrow, Position, Screen } from './core/types';
import { fitToContent } from './interactions/transform';
import { autoLayout } from './layout';
import { syncViewPicker } from './render/view-picker';

// Epic focus: show only one epic's screens (a screen can belong to several
// epics), laid out along their arrows and numbered in reading order. Purely a
// view — the real positions are set aside and restored on exit, and they are
// what commit() persists while a focus is on.

// Positions to persist: the real layout, never the temporary focus one.
export function persistedPositions(): Record<string, Position> {
  return state.focus ? state.focus.savedPositions : state.positions;
}

function applyPositionsToDom(): void {
  (state.project.screens || []).forEach(function (s: Screen) {
    var el = state.screenEls[s.id];
    var pos = state.positions[s.id];
    if (el && pos) { el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px'; }
  });
}

function clearFocusDecorations(): void {
  (state.project.screens || []).forEach(function (s: Screen) {
    var el = state.screenEls[s.id];
    if (!el) return;
    el.classList.remove('fb-focus-out');
    var badge = el.querySelector('.fb-step-badge');
    if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
  });
}

// Leave the focus view: restore the real positions and show every screen.
// `restore` false is used when the model was rebuilt (positions already fresh).
export function exitFocus(restore?: boolean): void {
  if (!state.focus) return;
  if (restore !== false) state.positions = state.focus.savedPositions;
  state.focus = null;
  if (state.screenEls) {
    clearFocusDecorations();
    applyPositionsToDom();
  }
  syncViewPicker();
}

// Focus one epic by id ('' = back to the whole board).
export function setFocus(epicId: string): void {
  var wasFocused = !!state.focus;
  exitFocus();
  if (!epicId) {
    drawArrows();
    if (wasFocused) fitToContent();
    return;
  }

  var screens: Screen[] = state.project.screens || [];
  var members = screens.filter(function (s) { return inEpic(s, epicId); });
  if (!members.length) { drawArrows(); return; }
  var epic = getEpic(epicId);
  var color = (epic && epic.color) || '#374151';

  var visible: Record<string, boolean> = {};
  members.forEach(function (s) { visible[s.id] = true; });

  var heights: Record<string, number> = {};
  members.forEach(function (s) { var el = state.screenEls[s.id]; if (el) heights[s.id] = el.offsetHeight; });
  var inner = (state.project.arrows || []).filter(function (a: Arrow) { return visible[a.from] && visible[a.to]; });
  var layout = autoLayout(members, inner, heights);

  state.focus = { type: 'epic', id: epicId, savedPositions: state.positions, visible: visible };
  var positions: Record<string, Position> = {};
  screens.forEach(function (s) {
    var p = layout[s.id] || state.focus.savedPositions[s.id];
    if (p) positions[s.id] = { x: p.x, y: p.y }; // copies: never share objects with the saved map
  });
  state.positions = positions;

  screens.forEach(function (s) {
    var el = state.screenEls[s.id];
    if (el) el.classList.toggle('fb-focus-out', !visible[s.id]);
  });

  // Step numbers in reading order: column by column, top to bottom.
  var ordered = members.slice().sort(function (a, b) {
    var pa = layout[a.id], pb = layout[b.id];
    return (pa.x - pb.x) || (pa.y - pb.y);
  });
  ordered.forEach(function (s, i) {
    var el = state.screenEls[s.id];
    if (!el) return;
    var badge = document.createElement('span');
    badge.className = 'fb-step-badge';
    badge.textContent = String(i + 1);
    badge.style.background = color;
    var header = el.querySelector('.fb-screen-header');
    if (header) header.insertBefore(badge, header.firstChild);
  });

  applyPositionsToDom();
  syncViewPicker();
  drawArrows();
  fitToContent();
}
