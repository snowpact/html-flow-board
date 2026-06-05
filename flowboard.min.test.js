import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Smoke-test the MINIFIED bundle (the file jsDelivr serves to most consumers)
// through its public API, guarding against a minifier-introduced break.
const src = fs.readFileSync(path.resolve(__dirname, 'flowboard.min.js'), 'utf-8');

describe('minified bundle (shipped artifact)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    try { window.localStorage.clear(); } catch (e) {}
    if (!document.elementFromPoint) document.elementFromPoint = () => null;
    eval(src);
  });

  it('exposes FlowBoard.init as a function', () => {
    expect(typeof window.FlowBoard.init).toBe('function');
  });

  it('init() builds the board from the public API', () => {
    window.FlowBoard.init({
      container: document.getElementById('app'),
      project: {
        name: 'Min',
        epics: [{ id: 'e1', label: 'E', color: '#f00' }],
        screens: [
          { id: 'A', title: 'A', epic: 'e1' },
          { id: 'B', title: 'B', epic: 'e1' },
        ],
        arrows: [{ from: 'A', to: 'B' }],
      },
    });
    expect(document.querySelector('.fb-mode-switch')).toBeTruthy();
    expect(document.querySelectorAll('.fb-screen').length).toBe(2);
  });
});
