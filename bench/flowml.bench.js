import { bench, describe } from 'vitest';
import { parse } from '../src/flowml/parse';
import { serialize } from '../src/flowml/serialize';
import { highlight } from '../src/flowml/highlight';
import { init } from '../src/board';
import { state } from '../src/core/state';
import { rebuildBoard } from '../src/interactions/sync';

// Synthetic board of N screens / ~N arrows / 2 epics, half custom-HTML.
function makeProject(n) {
  const epics = [
    { id: 'e0', label: 'Epic 0', color: '#6366f1' },
    { id: 'e1', label: 'Epic 1', color: '#10b981' },
  ];
  const screens = [];
  const arrows = [];
  const positions = {};
  for (let i = 0; i < n; i++) {
    const id = 's' + i;
    screens.push({
      id,
      title: 'Screen ' + i,
      preset: i % 3 === 0 ? 'form' : 'custom',
      format: 'desktop',
      epic: 'e' + (i % 2),
      notes: 'note ' + i,
      content: i % 3 === 0 ? undefined : '<div class="b">body ' + i + '</div>',
    });
    positions[id] = { x: (i % 10) * 420, y: Math.floor(i / 10) * 320 };
    if (i > 0) arrows.push({ from: 's' + (i - 1), to: id, label: i % 2 ? 'go ' + i : undefined });
  }
  return { project: { name: 'Bench', epics, screens, arrows }, positions };
}

[50, 200, 500].forEach((n) => {
  const { project, positions } = makeProject(n);
  const text = serialize(project, positions);
  describe(`flow-ml @ ${n} screens`, () => {
    bench('serialize', () => { serialize(project, positions); });
    bench('parse', () => { parse(text); });
    bench('highlight', () => { highlight(text); });
  });
});

describe('rebuildBoard (DOM)', () => {
  document.body.innerHTML = '<div id="app"></div>';
  if (!document.elementFromPoint) document.elementFromPoint = () => null;
  init({ container: document.getElementById('app'), project: { name: 'Bench', epics: [], screens: [], arrows: [] } });
  const big = makeProject(200);
  bench('rebuild 200 screens', () => {
    state.syncing = true;
    rebuildBoard(big.project, big.positions);
    state.syncing = false;
  });
});
