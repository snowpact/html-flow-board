import { drawArrows } from '../arrows';
import { state } from '../core/state';
import { FlowProject, Position } from '../core/types';
import { autoLayout } from '../layout';
import { parse } from '../flowml/parse';
import { serialize } from '../flowml/serialize';
import { renderScreen } from '../render/screen';
import { setPanelText } from '../render/panel';

// Rebuild the diagram (screens + arrows) from a parsed model. Positions come
// from the model; missing ones fall back to auto-layout.
export function rebuildBoard(project: FlowProject, positions: Record<string, Position>): void {
  state.project = project;
  state.hiddenScreens = {};
  (project.screens || []).forEach(function (s) { if (s.hidden) state.hiddenScreens[s.id] = true; });

  var auto = autoLayout(project.screens || [], project.arrows || []);
  state.defaultPositions = auto;
  state.positions = {};
  (project.screens || []).forEach(function (s) {
    state.positions[s.id] = positions[s.id] || auto[s.id] || { x: 100, y: 100 };
  });

  var olds = state.canvasEl.querySelectorAll('.fb-screen');
  for (var i = 0; i < olds.length; i++) {
    if (olds[i].parentNode) olds[i].parentNode.removeChild(olds[i]);
  }
  while (state.svgEl.firstChild) state.svgEl.removeChild(state.svgEl.firstChild);
  state.screenEls = {};

  (project.screens || []).forEach(function (s) {
    state.canvasEl.appendChild(renderScreen(s));
  });
  drawArrows();
}

// Diagram → text: re-serialize the current model into the panel. Skipped while a
// text → diagram rebuild is in progress (anti-loop).
export function commit(): void {
  if (state.syncing) return;
  (state.project.screens || []).forEach(function (s) { s.hidden = !!state.hiddenScreens[s.id]; });
  var text = serialize(state.project, state.positions);
  setPanelText(text);
  if (state.saveDoc) state.saveDoc(text);
}

var debounceTimer: any = null;

// Text → diagram: parse on debounced input and rebuild if it parses.
export function initSync(): void {
  state.commit = commit;
  var ta = state.panelTextarea;
  if (!ta) return;

  ta.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      var res = parse(ta.value);
      state.syncing = true;
      rebuildBoard(res.project, res.positions);
      state.syncing = false;
      if (state.saveDoc) state.saveDoc(ta.value);
    }, 300);
  });

  commit(); // initial fill of the panel from the rendered board
}
