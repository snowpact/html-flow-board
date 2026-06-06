// Flow-ML syntax highlighter. Produces HTML whose visible text (tags stripped,
// entities decoded) is byte-for-byte the input — so it can be layered behind a
// transparent <textarea> and stay aligned. Zero dependencies.
//
// Runs on every keystroke, so it is O(n): no per-character slicing, and all
// regexes are module-level (sticky where scanning, anchored where line-level).

function esc(s: string): string {
  if (s.indexOf('&') === -1 && s.indexOf('<') === -1 && s.indexOf('>') === -1) return s;
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tok(cls: string, s: string): string {
  return '<span class="fb-tok-' + cls + '">' + esc(s) + '</span>';
}

// Sticky scanners for the attribute tail (advanced via lastIndex, no slicing).
var RE_STR = /"(?:\\.|[^"])*"/y;
var RE_KEYEQ = /([A-Za-z][A-Za-z0-9]*)(\s*=\s*)/y;
var RE_COLOR = /#[0-9A-Fa-f]{3,8}\b/y;
var RE_NUM = /-?\d+(?:\.\d+)?/y;
var RE_WS = /\s+/y;
var RE_BARE = /[^\s,]+/y;

// Line-level matchers (anchored).
var RE_LEAD = /^\s*/;
var RE_FENCE = /^`{3,}$/;
var RE_DIRECTIVE = /^(![A-Za-z]+)(\s*=\s*)(.*)$/;
var RE_ARROW = /^("(?:\\.|[^"])*"|[^\s,"]+)(\s*(?:\.\.>|->)\s*)("(?:\\.|[^"])*"|[^\s,"]+)(.*)$/;
var RE_EPIC = /^(@(?:"(?:\\.|[^"])*"|[^\s,"]+))(.*)$/;
var RE_SCREEN = /^("(?:\\.|[^"])*"|[^\s,"]+)(.*)$/;

// Highlight the attribute tail of a line (e.g. ", t=Login, p=form, x=120, h").
// Char-accurate: every character is either wrapped or escaped, none dropped.
function hlAttrs(s: string): string {
  var out = '';
  var i = 0;
  var n = s.length;
  var m: RegExpExecArray | null;
  while (i < n) {
    var ch = s.charAt(i);
    if (ch === ',') { out += '<span class="fb-tok-punct">,</span>'; i++; continue; }
    if (ch === ' ' || ch === '\t') { RE_WS.lastIndex = i; m = RE_WS.exec(s); out += m[0]; i = RE_WS.lastIndex; continue; }
    if (ch === '"') { RE_STR.lastIndex = i; if ((m = RE_STR.exec(s))) { out += tok('string', m[0]); i = RE_STR.lastIndex; continue; } }
    if (ch === '#') { RE_COLOR.lastIndex = i; if ((m = RE_COLOR.exec(s))) { out += tok('color', m[0]); i = RE_COLOR.lastIndex; continue; } }
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
      RE_KEYEQ.lastIndex = i;
      if ((m = RE_KEYEQ.exec(s))) { out += tok('key', m[1]) + tok('punct', m[2]); i = RE_KEYEQ.lastIndex; continue; }
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      RE_NUM.lastIndex = i;
      if ((m = RE_NUM.exec(s))) { out += tok('num', m[0]); i = RE_NUM.lastIndex; continue; }
    }
    RE_BARE.lastIndex = i; m = RE_BARE.exec(s);
    if (m) { out += (m[0] === 'h') ? tok('flag', m[0]) : tok('value', m[0]); i = RE_BARE.lastIndex; continue; }
    out += esc(ch); i++;
  }
  return out;
}

// Highlight a whole Flow-ML document to HTML (line structure preserved).
export function highlight(text: string): string {
  // Normalize line endings to match parse(); a trailing \r otherwise breaks the
  // line-level regexes ('.' / '$' don't span \r).
  var lines = text.replace(/\r\n?/g, '\n').split('\n');
  var out: string[] = [];
  var fence: string | null = null; // open content fence, or null

  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];

    if (fence !== null) {
      if (line.trim() === fence) { out.push(tok('fence', line)); fence = null; }
      else out.push(tok('html', line));
      continue;
    }

    // Blank / whitespace-only line: emit verbatim (keeps the byte-for-byte invariant).
    if (line.trim() === '') { out.push(esc(line)); continue; }

    var lead = RE_LEAD.exec(line)[0];
    var body = line.slice(lead.length);
    var head = esc(lead);
    var m: RegExpExecArray | null;

    if (body.charAt(0) === '#') { out.push(head + tok('comment', body)); continue; }

    if (RE_FENCE.test(body)) { out.push(head + tok('fence', body)); fence = body; continue; }

    if (body.charAt(0) === '!') {
      m = RE_DIRECTIVE.exec(body);
      if (m) out.push(head + tok('directive', m[1]) + tok('punct', m[2]) + tok('value', m[3]));
      else out.push(head + tok('directive', body));
      continue;
    }

    // Arrow: from (op) to [, attrs] — endpoints stop at a comma.
    if (body.charAt(0) !== '@' && (m = RE_ARROW.exec(body))) {
      out.push(head + tok('ref', m[1]) + tok('arrow', m[2]) + tok('ref', m[3]) + hlAttrs(m[4]));
      continue;
    }

    if (body.charAt(0) === '@') {
      m = RE_EPIC.exec(body);
      if (m) out.push(head + tok('epic', m[1]) + hlAttrs(m[2]));
      else out.push(head + tok('epic', body)); // bare "@" mid-edit — never throw
      continue;
    }

    // Screen: id, attrs
    m = RE_SCREEN.exec(body);
    if (m) out.push(head + tok('screen', m[1]) + hlAttrs(m[2]));
    else out.push(head + esc(body)); // unclassifiable (e.g. leading comma) — plain
  }

  return out.join('\n');
}
