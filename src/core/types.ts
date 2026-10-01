// Shared domain + state types.
// tsconfig runs noImplicitAny (real param/return types) with strictNullChecks
// OFF, so nullable fields are typed by their set-value and null assigns freely.

export type Side = string; // 'right' | 'left-top' | ... (16 anchor names)
export type ScreenSize = 'sm' | 'md' | 'lg' | 'xl';
export type Format = 'desktop' | 'phone' | 'square'; // min proportions; the card grows past them

// Display preset for a screen's BODY. 'custom' (the default when absent) keeps
// today's behavior: render the raw `content` HTML. The others render a grey
// wireframe skeleton instead.
export type PresetId =
  | 'custom' | 'blank' | 'form' | 'list' | 'table' | 'dashboard' | 'cardgrid'
  | 'detail' | 'auth' | 'feed' | 'settings' | 'kanban' | 'modal' | 'gallery' | 'nav';

export interface Epic {
  id: string;
  label: string;
  color: string;
  [k: string]: any;
}

export interface Screen {
  id: string;
  title?: string;
  epic?: string;      // primary epic (header color)
  epics?: string[];   // every epic the screen belongs to (primary first), when more than one
  size?: ScreenSize;  // legacy; mapped to a default width for backward-compat
  format?: Format;    // device proportions (sets base width × height)
  width?: number;     // explicit body width (px)
  height?: number;    // explicit body height (px); absent ⇒ content-driven
  notes?: string;
  hidden?: boolean;   // Flow-ML round-trip of the legend hide toggle
  content?: string;   // raw HTML body, used when preset is 'custom'
  preset?: PresetId;  // body display preset; absent ⇒ 'custom'
  [k: string]: any;
}

export interface Size { width: number; height: number; }

export interface Arrow {
  from: string;
  to: string;
  fromSide?: Side;
  toSide?: Side;
  label?: string;
  dashed?: boolean;
  // Visual weight. 'main' = the user journey (a tunnel step, drawn bold);
  // 'nav' = secondary navigation (menus, back links: drawn thin, label on hover).
  // Absent ⇒ the classic default style.
  kind?: ArrowKind;
  // Optional API call behind this action. When set, the label is drawn as a
  // card: label (title) + a code line (`api`) + an optional detail line.
  api?: string;      // e.g. 'POST /v1/update · UPDATE_CLOTURE'
  apiNote?: string;  // e.g. 'heure de départ + compte rendu'
  [k: string]: any;
}

export type ArrowKind = 'main' | 'nav';

export interface Position { x: number; y: number; }
export interface Rect { left: number; top: number; right: number; bottom: number; }

export interface FlowProject {
  name?: string;
  epics?: Epic[];
  screens?: Screen[];
  arrows?: Arrow[];
}

// Temporary "focus" view: only one epic's screens are shown, laid out for
// reading. The real positions are kept aside and restored on exit; they are
// what gets persisted while the focus is on.
export interface FocusState {
  type: 'epic';
  id: string;
  savedPositions: Record<string, Position>;
  visible: Record<string, boolean>;
}

export interface FlowConfig {
  container: HTMLElement | string;
  project: FlowProject;
  state?: any;
}

export interface FlowState {
  zoom: number;
  panX: number;
  panY: number;
  mode: string;
  selected: Record<string, boolean>;
  selectBox: any;
  screenDrag: any;
  pointerInBoard: boolean;
  _dotZoom: number | null;
  project: FlowProject | null;
  container: HTMLElement | null;
  canvasEl: HTMLElement | null;
  sizerEl: HTMLElement | null;
  wrapperEl: HTMLElement | null;
  svgEl: SVGSVGElement | null;
  screenEls: Record<string, HTMLElement>;
  defaultPositions: Record<string, Position>;
  positions: Record<string, Position>;
  showNotes: boolean;
  hiddenEpics: Record<string, boolean>;
  handleEls: any[];
  draggingHandle: any;
  hiddenScreens: Record<string, boolean>;
  layoutIndex: number;
  screenPopup: any;
  panDrag: any;
  showNav?: boolean;       // draw 'nav' arrows (toolbar toggle)
  focus?: FocusState | null; // active epic focus view, or null
  // Escape hatch for the various ad-hoc fields touched across modules.
  [k: string]: any;
}
