// Shared domain + state types.
// tsconfig runs noImplicitAny (real param/return types) with strictNullChecks
// OFF, so nullable fields are typed by their set-value and null assigns freely.

export type Side = string; // 'right' | 'left-top' | ... (16 anchor names)
export type ScreenSize = 'sm' | 'md' | 'lg' | 'xl';
export type Format = 'desktop' | 'phone' | 'square'; // device proportions

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
  epic?: string;
  size?: ScreenSize;  // legacy; mapped to a default width for backward-compat
  format?: Format;    // device proportions (sets base width × height)
  width?: number;     // explicit body width (px)
  height?: number;    // explicit body height (px); absent ⇒ content-driven
  notes?: string;
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
  [k: string]: any;
}

export interface Position { x: number; y: number; }
export interface Rect { left: number; top: number; right: number; bottom: number; }

export interface FlowProject {
  name?: string;
  epics?: Epic[];
  screens?: Screen[];
  arrows?: Arrow[];
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
  // Escape hatch for the various ad-hoc fields touched across modules.
  [k: string]: any;
}
