import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Smoke-test the MINIFIED bundle (the file jsDelivr serves to most consumers).
// The main suites load flowboard.js; this guards against a minifier-introduced
// break in flowboard.min.js by asserting the runtime contract still holds.
const src = fs.readFileSync(path.resolve(__dirname, 'flowboard.min.js'), 'utf-8');

const INTERNAL = [
  'state', 'autoLayout', 'bfsDepth', 'centerPositions', 'layoutByEpics', 'layoutGrid',
  'getAnchor', 'getPrimarySide', 'computeControlPoints', 'getAllAnchorPoints',
  'getBestSides', 'buildSpreadMap', 'resolveArrowSides', 'rectsIntersect', 'toggleSelection',
];

describe('minified bundle runtime contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    eval(src);
  });

  it('sets window.FlowBoard.init as a function', () => {
    expect(typeof window.FlowBoard.init).toBe('function');
  });

  it('exposes all 15 _internal symbols', () => {
    INTERNAL.forEach((name) => {
      expect(window.FlowBoard._internal).toHaveProperty(name);
    });
  });

  it('keeps the geometry helper behaving after minification', () => {
    const { rectsIntersect } = window.FlowBoard._internal;
    expect(rectsIntersect({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 5, top: 5, right: 15, bottom: 15 })).toBe(true);
    expect(rectsIntersect({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 20, top: 0, right: 30, bottom: 10 })).toBe(false);
  });
});
