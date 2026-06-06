import { Arrow, Epic, FlowProject, Position, PresetId, Screen } from '../core/types';

export interface ParseResult {
  project: FlowProject;
  positions: Record<string, Position>;
  errors: { line: number; msg: string }[];
}

function unquote(v: string): string {
  v = v.trim();
  if (v.length >= 2 && v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') {
    return v.slice(1, -1).replace(/\\"/g, '"');
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

// "k=v" → { k: 'v' } (v unquoted); bare token → { token: true } (flag).
function parseAttrs(attrParts: string[]): Record<string, any> {
  var attrs: Record<string, any> = {};
  attrParts.forEach(function (p) {
    var eq = p.indexOf('=');
    if (eq === -1) attrs[p] = true;
    else attrs[p.slice(0, eq).trim()] = unquote(p.slice(eq + 1));
  });
  return attrs;
}

// Parse Flow-ML text to the board model. Tolerant: bad lines are recorded in
// `errors` and skipped; parsing never throws. The inverse of serialize().
export function parse(text: string): ParseResult {
  var project: FlowProject = { name: '', epics: [], screens: [], arrows: [] };
  var positions: Record<string, Position> = {};
  var errors: { line: number; msg: string }[] = [];

  var lines = text.split('\n');
  var lastScreen: Screen | null = null;
  var i = 0;

  while (i < lines.length) {
    var line = lines[i].trim();
    var lineNo = i + 1;

    if (line === '' || line.charAt(0) === '#') { i++; continue; }

    // Fenced HTML block → content of the screen just above.
    if (line === '```') {
      var html: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '```') { html.push(lines[i]); i++; }
      i++; // skip closing fence
      if (lastScreen) {
        lastScreen.content = html.join('\n');
        if (!lastScreen.preset) lastScreen.preset = 'custom';
      } else {
        errors.push({ line: lineNo, msg: 'HTML block without a preceding screen' });
      }
      continue;
    }

    // Directive: !name = ...
    if (line.charAt(0) === '!') {
      var dm = line.slice(1).match(/^\s*([a-zA-Z]+)\s*=\s*(.*)$/);
      if (dm && dm[1] === 'name') project.name = unquote(dm[2]);
      else errors.push({ line: lineNo, msg: 'unknown directive' });
      i++; continue;
    }

    // Arrow: a -> b  /  a ..> b   (optional ", attrs")
    var am = line.match(/^(\S+)\s*(\.\.>|->)\s*(\S+?)(?:\s*,\s*(.*))?$/);
    if (am) {
      var arrow: Arrow = { from: am[1], to: am[3] };
      if (am[2] === '..>') arrow.dashed = true;
      var aattrs = am[4] ? parseAttrs(splitAttrs(am[4])) : {};
      if (aattrs.l) arrow.label = aattrs.l;
      if (aattrs.fs) arrow.fromSide = aattrs.fs;
      if (aattrs.ts) arrow.toSide = aattrs.ts;
      project.arrows.push(arrow);
      lastScreen = null;
      i++; continue;
    }

    // Epic: @id, attrs
    if (line.charAt(0) === '@') {
      var eparts = splitAttrs(line.slice(1));
      var epic: Epic = { id: eparts.shift() || '', label: '', color: '' };
      var ea = parseAttrs(eparts);
      if (ea.t) epic.label = ea.t;
      if (ea.c) epic.color = ea.c;
      project.epics.push(epic);
      lastScreen = null;
      i++; continue;
    }

    // Screen: id, attrs
    var sparts = splitAttrs(line);
    var id = sparts.shift();
    if (!id) { errors.push({ line: lineNo, msg: 'invalid line' }); i++; continue; }
    var sa = parseAttrs(sparts);
    var screen: Screen = { id: id };
    if (sa.t) screen.title = sa.t;
    if (sa.p) screen.preset = sa.p as PresetId;
    if (sa.f) screen.format = sa.f;
    if (sa.e) screen.epic = sa.e;
    if (sa.n) screen.notes = sa.n;
    if (sa.h) screen.hidden = true;
    if (sa.x !== undefined || sa.y !== undefined) {
      positions[id] = { x: parseFloat(sa.x) || 0, y: parseFloat(sa.y) || 0 };
    }
    project.screens.push(screen);
    lastScreen = screen;
    i++;
  }

  return { project: project, positions: positions, errors: errors };
}
