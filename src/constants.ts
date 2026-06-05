// @ts-nocheck

// -- Constants --
export var CANVAS_W = 10000;
export var CANVAS_H = 8000;
export var ZOOM_MIN = 0.2;
export var ZOOM_MAX = 2;
export var ZOOM_STEP = 0.1;
export var SIZES = { sm: 240, md: 320, lg: 400, xl: 520 };
export var GAP_X = 100;
export var GAP_Y = 40;
export var ARROW_OFFSET = 60;
export var ARROW_BLEND = 0.15;
export var SELECT_DRAG_THRESHOLD = 3; // px before a background drag counts as a rubber-band
// Dotted-grid background. Counter-scaled against zoom so the dots keep a
// constant on-screen size (see applyTransform). Must match flowboard.css.
export var DOT_SPACING = 22;   // px between dots at zoom 1
export var DOT_RADIUS = 1.3;   // dot radius at zoom 1
export var DOT_COLOR = '#c9ced6';

// Mode-switch icons (inline SVG, currentColor)
export var ICON_CURSOR = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>';
export var ICON_HAND = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-7.4-5L2.5 13a2 2 0 0 1 3.5-2l1 1.5"/></svg>';

// -- State --
