import { describe, it, expect } from 'vitest';
import { parse } from './src/flowml/parse';
import { serialize } from './src/flowml/serialize';

const RICH = {
  project: {
    name: 'Mon app',
    epics: [{ id: 'auth', label: 'Authentication', color: '#6366f1' }],
    screens: [
      { id: 'login', title: 'Login', preset: 'form', format: 'phone', epic: 'auth' },
      { id: 'home', title: 'Dashboard', preset: 'dashboard', format: 'desktop', epic: 'auth' },
      { id: 'prefs', title: 'Mes réglages', preset: 'custom', content: '<div>x</div>' },
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
    expect(out).toContain('login, t=Login, p=form, f=phone, e=auth, x=120, y=80');
    expect(out).toContain('prefs, t="Mes réglages", x=920, y=80'); // custom → no p=, quoted title
    expect(out).toContain('<div>x</div>'); // fenced custom HTML
    expect(out).toContain('home -> prefs, l=ouvrir');
    expect(out).toContain('login ..> prefs'); // dashed
  });
});

describe('flow-ml parse', () => {
  it('reads a screen with attributes and a position', () => {
    const { project, positions } = parse('login, t=Login, p=form, f=phone, e=auth, x=120, y=80\n');
    expect(project.screens[0]).toEqual({ id: 'login', title: 'Login', preset: 'form', format: 'phone', epic: 'auth' });
    expect(positions.login).toEqual({ x: 120, y: 80 });
  });

  it('reads an epic, a dashed arrow, and a labelled arrow', () => {
    const { project } = parse('@auth, t=Authentication, c=#6366f1\na -> b\nb ..> c\nb -> c, l=go\n');
    expect(project.epics[0]).toEqual({ id: 'auth', label: 'Authentication', color: '#6366f1' });
    expect(project.arrows).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c', dashed: true },
      { from: 'b', to: 'c', label: 'go' },
    ]);
  });

  it('collects a fenced HTML block into the preceding screen (custom)', () => {
    const { project } = parse('prefs, t=Settings\n```\n<b>hi</b>\n```\n');
    expect(project.screens[0].content).toBe('<b>hi</b>');
    expect(project.screens[0].preset).toBe('custom');
  });

  it('ignores comments/blanks and records errors without throwing', () => {
    const { project, errors } = parse('# a comment\n\nlogin, t=Login\n!bogus = 1\n```\nx\n```\n');
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
