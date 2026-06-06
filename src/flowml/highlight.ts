// Flow-ML syntax highlighter. Produces HTML whose visible text (tags stripped,
// entities decoded) is byte-for-byte the input — so it can be layered behind a
// transparent <textarea> and stay aligned. Zero dependencies.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tok(cls: string, s: string): string {
  return '<span class="fb-tok-' + cls + '">' + esc(s) + '</span>';
}

// Highlight the attribute tail of a line (e.g. ", t=Login, p=form, x=120, h").
// Char-accurate: every character is either wrapped or escaped, none dropped.
function hlAttrs(s: string): string {
  var out = '';
  var i = 0;
  var m: RegExpExecArray | null;
  while (i < s.length) {
    var rest = s.slice(i);
    if ((m = /^("(?:\\.|[^"])*")/.exec(rest))) { out += tok('string', m[1]); i += m[1].length; continue; }
    if ((m = /^([A-Za-z][A-Za-z0-9]*)(\s*=\s*)/.exec(rest))) { out += tok('key', m[1]) + tok('punct', m[2]); i += m[0].length; continue; }
    if ((m = /^(#[0-9A-Fa-f]{3,8})\b/.exec(rest))) { out += tok('color', m[1]); i += m[1].length; continue; }
    if ((m = /^(-?\d+(?:\.\d+)?)/.exec(rest))) { out += tok('num', m[1]); i += m[1].length; continue; }
    if ((m = /^(,)/.exec(rest))) { out += tok('punct', m[1]); i += 1; continue; }
    if ((m = /^(\s+)/.exec(rest))) { out += esc(m[1]); i += m[1].length; continue; }
    if ((m = /^([^\s,]+)/.exec(rest))) {
      out += (m[1] === 'h') ? tok('flag', m[1]) : tok('value', m[1]);
      i += m[1].length; continue;
    }
    out += esc(rest.charAt(0)); i += 1;
  }
  return out;
}

function leading(line: string): string {
  var m = /^\s*/.exec(line);
  return m ? m[0] : '';
}

// Highlight a whole Flow-ML document to HTML (line structure preserved).
export function highlight(text: string): string {
  var lines = text.split('\n');
  var out: string[] = [];
  var fence: string | null = null; // open content fence, or null

  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];

    if (fence !== null) {
      if (line.trim() === fence) { out.push(tok('fence', line)); fence = null; }
      else out.push(tok('html', line));
      continue;
    }

    if (line.trim() === '') { out.push(''); continue; }

    var lead = leading(line);
    var body = line.slice(lead.length);
    var head = esc(lead);
    var m: RegExpExecArray | null;

    if (body.charAt(0) === '#') { out.push(head + tok('comment', body)); continue; }

    if (/^`{3,}$/.test(body)) { out.push(head + tok('fence', body)); fence = body; continue; }

    if (body.charAt(0) === '!') {
      m = /^(![A-Za-z]+)(\s*=\s*)(.*)$/.exec(body);
      if (m) out.push(head + tok('directive', m[1]) + tok('punct', m[2]) + tok('value', m[3]));
      else out.push(head + tok('directive', body));
      continue;
    }

    // Arrow: from (op) to [, attrs] — endpoints stop at a comma.
    if (body.charAt(0) !== '@' && (m = /^([^\s,]+)(\s*(?:\.\.>|->)\s*)([^\s,]+)(.*)$/.exec(body))) {
      out.push(head + tok('ref', m[1]) + tok('arrow', m[2]) + tok('ref', m[3]) + hlAttrs(m[4]));
      continue;
    }

    if (body.charAt(0) === '@') {
      m = /^(@[^\s,]+)(.*)$/.exec(body);
      out.push(head + tok('epic', m[1]) + hlAttrs(m[2]));
      continue;
    }

    // Screen: id, attrs
    m = /^([^\s,]+)(.*)$/.exec(body);
    out.push(head + tok('screen', m[1]) + hlAttrs(m[2]));
  }

  return out.join('\n');
}
