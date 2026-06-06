import { Arrow, Epic, FlowProject, Position, Screen } from '../core/types';

// Quote a value if it contains whitespace, a comma, or a quote.
function q(v: string): string {
  return /[\s,"]/.test(v) ? '"' + v.replace(/"/g, '\\"') + '"' : v;
}

// Serialize the board model to canonical Flow-ML. Deterministic (array order),
// so re-serialization is stable. The inverse of parse().
export function serialize(project: FlowProject, positions: Record<string, Position>): string {
  var out: string[] = [];

  if (project.name) out.push('!name = ' + project.name);

  (project.epics || []).forEach(function (e: Epic) {
    var parts = ['@' + e.id];
    if (e.label) parts.push('t=' + q(e.label));
    if (e.color) parts.push('c=' + e.color);
    out.push(parts.join(', '));
  });

  if (out.length) out.push('');

  (project.screens || []).forEach(function (s: Screen) {
    var parts = [s.id];
    if (s.title) parts.push('t=' + q(s.title));
    if (s.preset && s.preset !== 'custom') parts.push('p=' + s.preset);
    if (s.format) parts.push('f=' + s.format);
    if (s.epic) parts.push('e=' + s.epic);
    if (s.notes) parts.push('n=' + q(s.notes));
    var pos = positions[s.id];
    if (pos) {
      parts.push('x=' + Math.round(pos.x));
      parts.push('y=' + Math.round(pos.y));
    }
    if (s.hidden) parts.push('h');
    out.push(parts.join(', '));

    if ((!s.preset || s.preset === 'custom') && s.content) {
      out.push('```');
      out.push(s.content);
      out.push('```');
    }
  });

  if (project.arrows && project.arrows.length) {
    out.push('');
    project.arrows.forEach(function (a: Arrow) {
      var line = a.from + (a.dashed ? ' ..> ' : ' -> ') + a.to;
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
