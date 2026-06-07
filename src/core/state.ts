import { FORMATS, SIZES } from './constants';
import { Epic, FlowState, Screen } from './types';

export var state: FlowState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  mode: 'drag',        // 'drag' (pan) | 'select' (cursor)
  selected: {},        // { screenId: true }
  selectBox: null,     // active rubber-band drag
  screenDrag: null,    // active screen move (1..N screens)
  pointerInBoard: false, // gates keyboard shortcuts to when hovering the board
  _dotZoom: null,      // last zoom the dotted grid was counter-scaled for
  project: null,
  container: null,
  canvasEl: null,
  sizerEl: null,
  wrapperEl: null,
  svgEl: null,
  screenEls: {},
  defaultPositions: {},
  positions: {},
  showNotes: true,
  hiddenEpics: {},
  handleEls: [],
  draggingHandle: null,
  hiddenScreens: {},
  layoutIndex: 0,
  screenPopup: null,
  panDrag: null,
  storageKeyBase: null   // pinned localStorage prefix (survives !name edits)
};

// Epic data by id.
export function getEpic(epicId: string): Epic | null {
  if (!state.project || !state.project.epics) return null;
  for (var i = 0; i < state.project.epics.length; i++) {
    if (state.project.epics[i].id === epicId) return state.project.epics[i];
  }
  return null;
}

// An epic counts as hidden when every one of its screens is hidden. Derived from
// hiddenScreens; recomputed after any rebuild so the legend stays in sync.
export function recomputeHiddenEpics(): void {
  state.hiddenEpics = {};
  var screens = (state.project && state.project.screens) || [];
  ((state.project && state.project.epics) || []).forEach(function (epic: Epic) {
    var es = screens.filter(function (s: Screen) { return s.epic === epic.id; });
    if (es.length && es.every(function (s: Screen) { return state.hiddenScreens[s.id]; })) {
      state.hiddenEpics[epic.id] = true;
    }
  });
}

// Nominal body width (used by auto-layout for column packing): the format's MIN
// width, else legacy explicit width / size, else 320.
export function screenWidth(s: Screen): number {
  if (s.format && FORMATS[s.format]) return FORMATS[s.format].width;
  if (s.width) return s.width;
  if (s.size && SIZES[s.size]) return SIZES[s.size];
  return 320;
}

// Legacy explicit height only — formats are min-sized (handled in renderScreen).
export function screenHeight(s: Screen): number | null {
  return s.height || null;
}
