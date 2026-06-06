import { describe, it, expect } from 'vitest';
import { parse } from './src/flowml/parse';
import { serialize } from './src/flowml/serialize';
import { highlight } from './src/flowml/highlight';

// Strip span tags + decode entities → the visible text the user sees.
const visible = (html) =>
  html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const RICH = {
  project: {
    name: 'Mon app',
    epics: [{ id: 'auth', label: 'Authentication', color: '#6366f1' }],
    screens: [
      { id: 'login', title: 'Login', preset: 'form', format: 'phone', epic: 'auth' },
      { id: 'home', title: 'Dashboard', preset: 'dashboard', format: 'desktop', epic: 'auth' },
      { id: 'prefs', title: 'Mes réglages', content: '<div>x</div>' }, // custom ≡ absent preset
    ],
    arrows: [
      { from: 'login', to: 'home' },
      { from: 'home', to: 'prefs', label: 'ouvrir' },
      { from: 'login', to: 'prefs', dashed: true },
    ],
  },
  positions: { login: { x: 120, y: 80 }, home: { x: 520, y: 80 }, prefs: { x: 920, y: 80 } },
};

describe('flow-ml serialize', () => {
  it('emits canonical lines for the model', () => {
    const out = serialize(RICH.project, RICH.positions);
    expect(out).toContain('!name = Mon app');
    expect(out).toContain('@auth, t=Authentication, c=#6366f1');
    expect(out).toContain(':login, t=Login, p=form, f=phone, e=auth, x=120, y=80');
    expect(out).toContain(':prefs, t="Mes réglages", x=920, y=80'); // custom → no p=, quoted title
    expect(out).toContain('<div>x</div>'); // fenced custom HTML
    expect(out).toContain('home -> prefs, l=ouvrir');
    expect(out).toContain('login --> prefs'); // dashed
  });
});

describe('flow-ml parse', () => {
  it('reads a screen with attributes and a position', () => {
    const { project, positions } = parse(':login, t=Login, p=form, f=phone, e=auth, x=120, y=80\n');
    expect(project.screens[0]).toEqual({ id: 'login', title: 'Login', preset: 'form', format: 'phone', epic: 'auth' });
    expect(positions.login).toEqual({ x: 120, y: 80 });
  });

  it('rejects an un-prefixed screen line (no bare screens)', () => {
    const { project, errors } = parse('login, t=Login\n');
    expect(project.screens).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('reads an epic, a dashed arrow, and a labelled arrow', () => {
    const { project } = parse('@auth, t=Authentication, c=#6366f1\na -> b\nb --> c\nb -> c, l=go\n');
    expect(project.epics[0]).toEqual({ id: 'auth', label: 'Authentication', color: '#6366f1' });
    expect(project.arrows).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c', dashed: true },
      { from: 'b', to: 'c', label: 'go' },
    ]);
  });

  it('collects a fenced HTML block into the preceding screen (custom ≡ absent preset)', () => {
    const { project } = parse(':prefs, t=Settings\n```\n<b>hi</b>\n```\n');
    expect(project.screens[0].content).toBe('<b>hi</b>');
    expect(project.screens[0].preset).toBeUndefined();
  });

  it('ignores comments/blanks and records errors without throwing', () => {
    const { project, errors } = parse('# a comment\n\n:login, t=Login\n!bogus = 1\n```\nx\n```\n');
    expect(project.screens).toHaveLength(1);
    expect(errors.length).toBeGreaterThan(0); // unknown directive
  });
});

describe('flow-ml round-trip', () => {
  it('parse(serialize(model)) reproduces the model', () => {
    const out = serialize(RICH.project, RICH.positions);
    const back = parse(out);
    expect(back.project).toEqual(RICH.project);
    expect(back.positions).toEqual(RICH.positions);
  });

  it('serialize is idempotent through a parse', () => {
    const once = serialize(RICH.project, RICH.positions);
    const reparsed = parse(once);
    const twice = serialize(reparsed.project, reparsed.positions);
    expect(twice).toBe(once);
  });
});

describe('flow-ml hardening (round-trip edge cases)', () => {
  const rt = (project, positions = {}) => {
    const back = parse(serialize(project, positions));
    return back.project.screens[0];
  };

  it('preserves newlines in title / notes / arrow label', () => {
    const s = rt({ screens: [{ id: 'a', title: 'l1\nl2', notes: 'n1\nn2' }] });
    expect(s.title).toBe('l1\nl2');
    expect(s.notes).toBe('n1\nn2');
    const { project } = parse(serialize(
      { screens: [{ id: 'a' }, { id: 'b' }], arrows: [{ from: 'a', to: 'b', label: 'go\nnow' }] }, {}));
    expect(project.arrows[0].label).toBe('go\nnow');
    expect(project.screens).toHaveLength(2); // the newline value did not spawn a bogus screen
  });

  it('preserves backslashes and quotes in values', () => {
    const s = rt({ screens: [{ id: 'a', title: 'a "x" \\ b' }] });
    expect(s.title).toBe('a "x" \\ b');
  });

  it('keeps content that itself contains a ``` line (variable-length fence)', () => {
    const content = 'before\n```\nafter';
    const s = rt({ screens: [{ id: 'a', content }] });
    expect(s.content).toBe(content);
    const { project } = parse(serialize({ screens: [{ id: 'a', content }] }, {}));
    expect(project.screens).toHaveLength(1); // no spurious "after" screen
  });

  it('normalizes CRLF in fenced content', () => {
    const { project } = parse(':a\r\n```\r\n<div>x</div>\r\n```\r\n');
    expect(project.screens[0].content).toBe('<div>x</div>');
  });

  it('keeps content when a non-custom preset is set', () => {
    const s = rt({ screens: [{ id: 'a', preset: 'form', content: '<div>keep</div>' }] });
    expect(s.preset).toBe('form');
    expect(s.content).toBe('<div>keep</div>');
  });

  it('round-trips size / width / height', () => {
    const s = rt({ screens: [{ id: 'a', size: 'lg', width: 400, height: 300 }] });
    expect(s.size).toBe('lg');
    expect(s.width).toBe(400);
    expect(s.height).toBe(300);
  });

  it('records an error for a malformed arrow instead of making a junk screen', () => {
    const { project, errors } = parse('a -> b c\n');
    expect(project.screens).toHaveLength(0);
    expect(project.arrows).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('does not treat an arrow inside a quoted value as an arrow', () => {
    const { project } = parse(':home, t="go -> next"\n');
    expect(project.screens).toHaveLength(1);
    expect(project.screens[0].title).toBe('go -> next');
    expect(project.arrows).toHaveLength(0);
  });

  it('ignores a bare unknown attribute (no title=true)', () => {
    const { project } = parse(':a, t\n');
    expect(project.screens[0].title).toBeUndefined();
  });

  it('round-trips ids with spaces, commas, quotes, and leading specials', () => {
    for (const id of ['a b', 'a,b', 'a"b', '@weird', '#home', '!bang', '`tick']) {
      const s = rt({ screens: [{ id, title: 'X' }] });
      expect(s.id).toBe(id);
      expect(s.title).toBe('X');
    }
  });

  it('round-trips an arrow whose endpoints need quoting', () => {
    const { project } = parse(serialize(
      { screens: [{ id: 'a b' }, { id: '#c' }], arrows: [{ from: 'a b', to: '#c', label: 'go' }] }, {}));
    expect(project.screens.map((s) => s.id).sort()).toEqual(['#c', 'a b']);
    expect(project.arrows).toEqual([{ from: 'a b', to: '#c', label: 'go' }]);
  });

  it('round-trips an epic id and a project name needing quoting', () => {
    const { project } = parse(serialize(
      { name: 'a\nb', epics: [{ id: 'e x', label: 'L', color: '#fff' }], screens: [{ id: 's', epic: 'e x' }] }, {}));
    expect(project.name).toBe('a\nb');
    expect(project.epics[0].id).toBe('e x');
    expect(project.screens[0].epic).toBe('e x');
  });

  it('round-trips arrow side attributes as from= / to=', () => {
    const out = serialize(
      { screens: [{ id: 'a' }, { id: 'b' }], arrows: [{ from: 'a', to: 'b', fromSide: 'right', toSide: 'left' }] }, {});
    expect(out).toContain('from=right');
    expect(out).toContain('to=left');
    expect(parse(out).project.arrows[0]).toEqual({ from: 'a', to: 'b', fromSide: 'right', toSide: 'left' });
  });

  it('uses --> for dashed arrows; ..> is no longer accepted', () => {
    expect(parse('a --> b\n').project.arrows[0].dashed).toBe(true);
    expect(parse('a -> b\n').project.arrows[0].dashed).toBeUndefined();
    expect(parse('a ..> b\n').project.arrows).toHaveLength(0); // dropped form → error
    const out = serialize({ screens: [{ id: 'a' }, { id: 'b' }], arrows: [{ from: 'a', to: 'b', dashed: true }] }, {});
    expect(out).toContain('a --> b');
    expect(out).not.toContain('..>');
  });

  it('round-trips and is idempotent over adversarial ids (fuzz)', () => {
    const ids = ['plain', 'a b', 'a,b', 'a"b', '@x', '#x', '!x', '`x', 'a\\b', 'a -> b', 'with, comma'];
    const project = {
      name: 'Fuzz',
      epics: [{ id: ids[2], label: 'E, with comma', color: '#abc' }],
      screens: ids.map((id, i) => ({ id, title: 'T' + i, epic: i === 0 ? ids[2] : undefined })),
      arrows: [{ from: ids[1], to: ids[5], label: 'l' }, { from: ids[4], to: ids[3] }],
    };
    const positions = {};
    ids.forEach((id, i) => { positions[id] = { x: i * 10, y: i }; });

    const once = serialize(project, positions);
    const back = parse(once);
    expect(back.errors).toEqual([]);
    expect(back.project.screens.map((s) => s.id)).toEqual(ids); // every id survived
    expect(back.project.arrows).toEqual(project.arrows);         // endpoints survived
    expect(back.project.epics[0].id).toBe(ids[2]);
    // canonical + stable: re-serializing the parsed model reproduces the text
    expect(serialize(back.project, back.positions)).toBe(once);
  });
});

describe('flow-ml highlight', () => {
  it('is layout-preserving: visible text equals the input exactly', () => {
    const doc = serialize(RICH.project, RICH.positions);
    expect(visible(highlight(doc))).toBe(doc);
  });

  it('escapes HTML inside fenced content', () => {
    const html = highlight('a\n```\n<div class="x">&hi</div>\n```\n');
    expect(html).toContain('&lt;div');
    expect(html).not.toContain('<div class="x">'); // raw HTML not injected
    expect(visible(html)).toContain('<div class="x">&hi</div>');
  });

  it('tags each construct with a distinct token class', () => {
    const html = highlight('!name = App\n@auth, t="My Auth", c=#6366f1\n:login, t=Login, p=form, x=12, h\nlogin -> home\n# note\n');
    expect(html).toContain('fb-tok-directive');
    expect(html).toContain('fb-tok-epic');
    expect(html).toContain('fb-tok-screen');
    expect(html).toContain('fb-tok-arrow');
    expect(html).toContain('fb-tok-key');
    expect(html).toContain('fb-tok-string');
    expect(html).toContain('fb-tok-num');
    expect(html).toContain('fb-tok-color');
    expect(html).toContain('fb-tok-flag');
    expect(html).toContain('fb-tok-comment');
  });

  it('does not mistake an arrow inside a quoted value for an operator', () => {
    const html = highlight(':home, t="go -> next"\n');
    expect(html).toContain('fb-tok-screen'); // it is a screen line
    expect(html).not.toContain('fb-tok-arrow');
  });

  it('never throws and stays layout-preserving on edge lines', () => {
    for (const x of ['@', '@ ', '@,', '  @', 'login\nhome\n@', ',foo', '   ', '\t\t', ' \t ', 'x\r', 'a\r\nb', '']) {
      expect(() => highlight(x)).not.toThrow();
      expect(visible(highlight(x))).toBe(x.replace(/\r\n?/g, '\n')); // CRLF normalized like parse()
    }
  });
});
