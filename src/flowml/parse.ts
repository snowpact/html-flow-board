import { Arrow, Epic, FlowProject, Position, PresetId, ScreenSize, Screen } from '../core/types';

export interface ParseResult {
  project: FlowProject;
  positions: Record<string, Position>;
  errors: { line: number; msg: string }[];
}

// Bare tokens (no `=`) that are meaningful flags. Any other bare token is ignored
// rather than being turned into a `key=true` (which would corrupt round-trips).
var FLAGS: Record<string, boolean> = { h: true };

function unquote(v: string): string {
  v = v.trim();
  if (v.length >= 2 && v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') {
    // Single left-to-right pass: \\ → \, \" → ", \n → newline, \x → x.
    return v.slice(1, -1).replace(/\\(.)/g, function (_m, c) {
      return c === 'n' ? '\n' : c;
    });
  }
  return v;
}

// Split on commas that are NOT inside double quotes.
function splitAttrs(s: string): string[] {
  var parts: string[] = [];
  var cur = '';
  var inQ = false;
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (ch === '"' && s.charAt(i - 1) !== '\\') inQ = !inQ;
    if (ch === ',' && !inQ) { parts.push(cur); cur = ''; } else { cur += ch; }
  }
  parts.push(cur);
  return parts.map(function (p) { return p.trim(); }).filter(function (p) { return p !== ''; });
}

// "k=v" → { k: 'v' } (v unquoted); bare flag token → { flag: true }.
function parseAttrs(attrParts: string[]): Record<string, any> {
  var attrs: Record<string, any> = {};
  attrParts.forEach(function (p) {
    var eq = p.indexOf('=');
    if (eq === -1) { if (FLAGS[p]) attrs[p] = true; }
    else attrs[p.slice(0, eq).trim()] = unquote(p.slice(eq + 1));
  });
  return attrs;
}

// One token, either a "quoted string" (with escapes) or a bare run with no space,
// comma or quote. Used for arrow endpoints.
var ENDPOINT = '"(?:\\\\.|[^"])*"|[^\\s,"]+';
var ARROW_RE = new RegExp('^(' + ENDPOINT + ')\\s*(-->|->)\\s*(' + ENDPOINT + ')(?:\\s*,\\s*(.*))?$');

// Parse Flow-ML text to the board model. Tolerant: bad lines are recorded in
// `errors` and skipped; parsing never throws. The inverse of serialize().
//
// Line grammar (dispatched by first char — no ambiguity, no bare screens):
//   !name = …      directive
//   @id, …         epic
//   :id, …         screen
//   a -> b / a --> b   arrow (solid / dashed)
//   ``` … ```      HTML body of the screen above
//   # …            comment
export function parse(text: string): ParseResult {
  var project: FlowProject = { name: '', epics: [], screens: [], arrows: [] };
  var positions: Record<string, Position> = {};
  var errors: { line: number; msg: string }[] = [];

  // Parse one screen body ("id, attrs", `:` prefix already stripped).
  function addScreen(body: string): Screen | null {
    var sparts = splitAttrs(body);
    var idRaw = sparts.shift();
    if (!idRaw) return null;
    var id = unquote(idRaw);
    var sa = parseAttrs(sparts);
    var screen: Screen = { id: id };
    if (sa.t) screen.title = sa.t;
    if (sa.p) screen.preset = sa.p as PresetId;
    if (sa.f) screen.format = sa.f;
    if (sa.e) screen.epic = sa.e;
    if (sa.n) screen.notes = sa.n;
    if (sa.sz) screen.size = sa.sz as ScreenSize;
    if (sa.w !== undefined) { var w = parseFloat(sa.w); if (!isNaN(w)) screen.width = w; }
    if (sa.hg !== undefined) { var hh = parseFloat(sa.hg); if (!isNaN(hh)) screen.height = hh; }
    if (sa.h) screen.hidden = true;
    if (sa.x !== undefined || sa.y !== undefined) {
      positions[id] = { x: parseFloat(sa.x) || 0, y: parseFloat(sa.y) || 0 };
    }
    project.screens.push(screen);
    return screen;
  }

  // Normalize line endings so CRLF input round-trips identically to LF.
  var lines = text.replace(/\r\n?/g, '\n').split('\n');
  var lastScreen: Screen | null = null;
  var i = 0;

  while (i < lines.length) {
    var line = lines[i].trim();
    var lineNo = i + 1;
    var c0 = line.charAt(0);

    if (line === '' || c0 === '#') { i++; continue; }

    // Fenced HTML block (``` or longer) → content of the screen just above. The
    // closing fence must match the opening fence exactly, so an inner ``` line
    // stays part of the content.
    if (/^`{3,}$/.test(line)) {
      var fence = line;
      var html: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== fence) { html.push(lines[i]); i++; }
      i++; // skip closing fence
      if (lastScreen) lastScreen.content = html.join('\n');
      else errors.push({ line: lineNo, msg: 'HTML block without a preceding screen' });
      continue;
    }

    // Directive: !name = …
    if (c0 === '!') {
      var dm = line.slice(1).match(/^\s*([a-zA-Z]+)\s*=\s*(.*)$/);
      if (dm && dm[1] === 'name') project.name = unquote(dm[2]);
      else errors.push({ line: lineNo, msg: 'unknown directive' });
      i++; continue;
    }

    // Screen: :id, attrs
    if (c0 === ':') {
      var ps = addScreen(line.slice(1));
      if (ps) lastScreen = ps;
      else errors.push({ line: lineNo, msg: 'invalid screen' });
      i++; continue;
    }

    // Epic: @id, attrs
    if (c0 === '@') {
      var eparts = splitAttrs(line.slice(1));
      var epic: Epic = { id: unquote(eparts.shift() || ''), label: '', color: '' };
      var ea = parseAttrs(eparts);
      if (ea.t) epic.label = ea.t;
      if (ea.c) epic.color = ea.c;
      project.epics.push(epic);
      lastScreen = null;
      i++; continue;
    }

    // Arrow: a -> b (solid) / a --> b (dashed). Endpoints may be quoted.
    var am = line.match(ARROW_RE);
    if (am) {
      var arrow: Arrow = { from: unquote(am[1]), to: unquote(am[3]) };
      if (am[2] === '-->') arrow.dashed = true;
      var aattrs = am[4] ? parseAttrs(splitAttrs(am[4])) : {};
      if (aattrs.l) arrow.label = aattrs.l;
      if (aattrs.from) arrow.fromSide = aattrs.from;
      if (aattrs.to) arrow.toSide = aattrs.to;
      project.arrows.push(arrow);
      lastScreen = null;
      i++; continue;
    }

    // Anything else is not valid Flow-ML.
    errors.push({ line: lineNo, msg: 'unrecognized line' });
    lastScreen = null;
    i++;
  }

  return { project: project, positions: positions, errors: errors };
}
