import { drawArrows } from '../arrows';
import { recomputeHiddenEpics, state } from '../core/state';
import { FlowProject, Position } from '../core/types';
import { autoLayout } from '../layout';
import { saveDoc } from '../core/storage';
import { parse } from '../flowml/parse';
import { serialize } from '../flowml/serialize';
import { renderScreen } from '../render/screen';
import { setPanelText } from '../render/panel';
import { syncToolbar } from '../render/toolbar';

// Rebuild the diagram (screens + arrows) from a parsed model. Positions come
// from the model; missing ones fall back to auto-layout. Callers MUST set
// state.syncing while this runs: nothing it invokes may call state.commit().
export function rebuildBoard(project: FlowProject, positions: Record<string, Position>): void {
  state.project = project;
  state.hiddenScreens = {};
  (project.screens || []).forEach(function (s) { if (s.hidden) state.hiddenScreens[s.id] = true; });
  recomputeHiddenEpics();

  // Drop selection entries for screens that no longer exist.
  var ids: Record<string, boolean> = {};
  (project.screens || []).forEach(function (s) { ids[s.id] = true; });
  for (var sel in state.selected) { if (!ids[sel]) delete state.selected[sel]; }

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
  syncToolbar(); // project name + epic legend may have changed in the text
}

// Diagram → text: re-serialize the current model into the panel. Skipped while a
// text → diagram rebuild is in progress (anti-loop).
export function commit(): void {
  if (state.syncing) return;
  (state.project.screens || []).forEach(function (s) { s.hidden = !!state.hiddenScreens[s.id]; });
  var text = serialize(state.project, state.positions);
  setPanelText(text);
  saveDoc(text);
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
      // Never let a transient/incomplete edit wipe the board: if the text parses
      // to zero screens, persist it but keep the current diagram on screen.
      if (!res.project.screens || !res.project.screens.length) {
        saveDoc(ta.value);
        return;
      }
      state.syncing = true;
      rebuildBoard(res.project, res.positions);
      state.syncing = false;
      saveDoc(ta.value);
    }, 300);
  });

  commit(); // initial fill of the panel from the rendered board
}
