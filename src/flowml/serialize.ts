import { Arrow, Epic, FlowProject, Position, Screen } from '../core/types';

// Escape a value's backslash, quote and newline so it survives inside quotes.
function escVal(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// Quote a VALUE when it contains whitespace (incl. newlines), a comma, a quote,
// or a backslash, so it round-trips through parse()/unquote().
function q(v: string): string {
  var s = String(v);
  return /[\s,"\\]/.test(s) ? '"' + escVal(s) + '"' : s;
}

// The project name is the whole remainder after "!name =", so internal spaces and
// commas are safe; quote only when a newline, quote, backslash, or edge whitespace
// would otherwise be lost.
function qname(v: string): string {
  var s = String(v);
  return (/[\n"\\]/.test(s) || /^\s|\s$/.test(s)) ? '"' + escVal(s) + '"' : s;
}

// Quote a STRUCTURAL token (screen/epic id, arrow endpoint) — same rule as q(),
// plus a leading @ ! # or backtick (which would change the line's meaning) and
// any embedded backtick. Without this, an id like "@x" or "#x" is reparsed as an
// epic/comment and the screen is lost.
function qtok(v: string): string {
  var s = String(v);
  return (/[\s,"\\`]/.test(s) || /^[@!#`]/.test(s)) ? '"' + escVal(s) + '"' : s;
}

// Pick a backtick fence longer than any run of backticks inside the content, so a
// content line of ``` (or longer) can never be mistaken for the closing fence
// (CommonMark-style). Always at least 3 backticks.
function fenceFor(content: string): string {
  var longest = 0;
  var runs = content.match(/`+/g);
  if (runs) runs.forEach(function (r) { if (r.length > longest) longest = r.length; });
  var n = Math.max(3, longest + 1);
  var f = '';
  for (var i = 0; i < n; i++) f += '`';
  return f;
}

// Serialize the board model to canonical Flow-ML. Deterministic (array order),
// so re-serialization is stable. The inverse of parse().
export function serialize(project: FlowProject, positions: Record<string, Position>): string {
  var out: string[] = [];

  if (project.name) out.push('!name = ' + qname(project.name));

  (project.epics || []).forEach(function (e: Epic) {
    var parts = ['@' + qtok(e.id)];
    if (e.label) parts.push('t=' + q(e.label));
    if (e.color) parts.push('c=' + e.color);
    out.push(parts.join(', '));
  });

  if (out.length) out.push('');

  (project.screens || []).forEach(function (s: Screen) {
    var parts = [qtok(s.id)];
    if (s.title) parts.push('t=' + q(s.title));
    if (s.preset && s.preset !== 'custom') parts.push('p=' + s.preset);
    if (s.format) parts.push('f=' + s.format);
    if (s.epic) parts.push('e=' + s.epic);
    if (s.notes) parts.push('n=' + q(s.notes));
    if (s.size) parts.push('sz=' + s.size);
    if (s.width) parts.push('w=' + Math.round(s.width));
    if (s.height) parts.push('hg=' + Math.round(s.height));
    var pos = positions[s.id];
    if (pos) {
      parts.push('x=' + Math.round(pos.x));
      parts.push('y=' + Math.round(pos.y));
    }
    if (s.hidden) parts.push('h');
    out.push(parts.join(', '));

    // Content is preserved whatever the preset (rendering ignores it for
    // non-custom presets, but switching presets must not destroy the HTML).
    if (s.content) {
      var fence = fenceFor(s.content);
      out.push(fence);
      out.push(s.content);
      out.push(fence);
    }
  });

  if (project.arrows && project.arrows.length) {
    out.push('');
    project.arrows.forEach(function (a: Arrow) {
      var line = qtok(a.from) + (a.dashed ? ' ..> ' : ' -> ') + qtok(a.to);
      var attrs: string[] = [];
      if (a.label) attrs.push('l=' + q(a.label));
      if (a.fromSide) attrs.push('fs=' + a.fromSide);
      if (a.toSide) attrs.push('ts=' + a.toSide);
      if (attrs.length) line += ', ' + attrs.join(', ');
      out.push(line);
    });
  }

  return out.join('\n') + '\n';
}
